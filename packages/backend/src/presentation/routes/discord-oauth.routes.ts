/**
 * Discord OAuth2 picker routes.
 *
 * Backs the "bind a Discord channel at group creation" UI in
 * `GroupsPage.tsx`. All four routes are user-scoped (require the WAWPTN
 * session cookie) because the OAuth session cache is keyed by userId —
 * there is no bot-facing entry point here; the bot continues to use
 * `POST /api/discord/setup` for its own slash-command path.
 *
 *   GET  /api/discord/oauth/authorize  → returns the Discord authorize URL
 *   GET  /api/discord/oauth/callback   → code exchange, closes popup
 *   GET  /api/discord/guilds           → lists user guilds with bot presence
 *   GET  /api/discord/guilds/:id/channels → lists text channels in a guild
 *   DELETE /api/discord/oauth/session  → clears the server-side OAuth session
 *
 * Tokens are cached in-memory only; see `oauth-session-cache.ts` for the
 * TTL policy and sweep behaviour.
 */
import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { logger } from '../../infrastructure/logger/logger.js'
import {
  buildAuthorizeUrl,
  buildBotInviteUrl,
  exchangeCode,
  fetchGuildChannels,
  fetchUserGuilds,
  isDiscordOAuthConfigured,
  BotNotInGuildError,
} from '../../infrastructure/discord/oauth-client.js'
import {
  clearSession,
  consumeOAuthState,
  createOAuthState,
  getSession,
  setSession,
} from '../../infrastructure/discord/oauth-session-cache.js'

const router = Router()

// Start the OAuth2 flow. Returns the Discord authorize URL; the frontend
// opens it in a popup window and waits for a postMessage from the
// callback page below.
router.get('/oauth/authorize', requireAuth, (req: Request, res: Response) => {
  if (!isDiscordOAuthConfigured()) {
    res.status(503).json({
      error: 'discord_oauth_disabled',
      message: 'Discord OAuth is not configured on this server',
    })
    return
  }
  const userId = req.userId!
  const state = createOAuthState(userId)
  const url = buildAuthorizeUrl(state)
  res.json({ url })
})

// OAuth2 callback. Discord redirects the browser here with `code` and
// `state` query params; the browser carries the WAWPTN session cookie so
// `requireAuth` passes as usual. We exchange the code for an access
// token, store it under the user's session-cache entry, then return a
// tiny HTML page that posts a message to `window.opener` and closes
// itself. If the flow is opened in a regular tab instead of a popup
// (user with popups blocked) we fall back to a redirect to /groups.
router.get('/oauth/callback', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const code = typeof req.query['code'] === 'string' ? req.query['code'] : ''
  const state = typeof req.query['state'] === 'string' ? req.query['state'] : ''
  const error = typeof req.query['error'] === 'string' ? req.query['error'] : ''

  // Per-response CSP: the default app-wide CSP has `script-src 'self'`
  // which blocks the inline <script> we need to postMessage the result
  // back to the opener window. Override with a nonce-based policy scoped
  // to this single response — no third-party scripts, no 'unsafe-inline'.
  const nonce = crypto.randomBytes(16).toString('base64')
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
  )

  if (error) {
    // User denied consent or Discord-side problem.
    res.status(200).type('html').send(renderCallbackHtml({ ok: false, error }, nonce))
    return
  }

  if (!code || !state) {
    res.status(400).type('html').send(renderCallbackHtml({ ok: false, error: 'missing_params' }, nonce))
    return
  }

  const boundUserId = consumeOAuthState(state)
  if (!boundUserId || boundUserId !== userId) {
    res.status(400).type('html').send(renderCallbackHtml({ ok: false, error: 'invalid_state' }, nonce))
    return
  }

  try {
    const token = await exchangeCode(code)
    setSession(userId, token)
    res.status(200).type('html').send(renderCallbackHtml({ ok: true }, nonce))
  } catch (err) {
    logger.warn({ err: String(err), userId }, 'discord oauth: callback failed')
    res.status(500).type('html').send(renderCallbackHtml({ ok: false, error: 'exchange_failed' }, nonce))
  }
})

// List the guilds the authed user can manage, along with whether the
// WAWPTN bot is a member (so the UI can tell the user to invite the bot
// before they can pick a channel). Bot-presence is checked lazily only
// for the guild the user clicks on — see the `/guilds/:id/channels`
// route — so the list endpoint stays cheap.
router.get('/guilds', requireAuth, async (req: Request, res: Response) => {
  if (!isDiscordOAuthConfigured()) {
    res.status(503).json({
      error: 'discord_oauth_disabled',
      message: 'Discord OAuth is not configured on this server',
    })
    return
  }

  const userId = req.userId!
  const session = getSession(userId)
  if (!session) {
    res.status(401).json({
      error: 'discord_not_connected',
      message: 'No active Discord OAuth session — reconnect Discord',
    })
    return
  }

  try {
    const guilds = await fetchUserGuilds(session.token.accessToken)
    res.json({ guilds })
  } catch (err) {
    logger.warn({ err: String(err), userId }, 'discord oauth: fetchUserGuilds failed')
    res.status(502).json({
      error: 'discord_api_error',
      message: 'Failed to reach Discord',
    })
  }
})

// List the text channels of a specific guild. Uses the bot token — if
// the bot is not in the guild, return a 404-ish response with an
// `inviteUrl` so the frontend can prompt the user to add the bot.
router.get('/guilds/:id/channels', requireAuth, async (req: Request, res: Response) => {
  if (!isDiscordOAuthConfigured()) {
    res.status(503).json({
      error: 'discord_oauth_disabled',
      message: 'Discord OAuth is not configured on this server',
    })
    return
  }

  const userId = req.userId!
  const guildId = String(req.params['id'])

  // Soft gate: make sure the user actually went through OAuth — we
  // could technically serve this endpoint without an OAuth session
  // (the bot token is enough) but that would let any logged-in user
  // enumerate channels of any guild the bot is in, so we keep it
  // scoped to an active picker session.
  if (!getSession(userId)) {
    res.status(401).json({
      error: 'discord_not_connected',
      message: 'No active Discord OAuth session — reconnect Discord',
    })
    return
  }

  try {
    const channels = await fetchGuildChannels(guildId)
    res.json({ channels })
  } catch (err) {
    if (err instanceof BotNotInGuildError) {
      res.status(409).json({
        error: 'bot_not_in_guild',
        message: 'The WAWPTN bot is not a member of this server',
        inviteUrl: buildBotInviteUrl(guildId),
      })
      return
    }
    logger.warn({ err: String(err), userId, guildId }, 'discord oauth: fetchGuildChannels failed')
    res.status(502).json({
      error: 'discord_api_error',
      message: 'Failed to reach Discord',
    })
  }
})

// Clear the server-side OAuth session. Called by the frontend after a
// successful group creation so we do not hold onto the user's Discord
// access token longer than strictly needed.
router.delete('/oauth/session', requireAuth, (req: Request, res: Response) => {
  clearSession(req.userId!)
  res.json({ ok: true })
})

/** Minimal HTML template for the popup callback page. Posts a typed
 *  message to the opener so the frontend can react without polling. */
function renderCallbackHtml(
  result: { ok: true } | { ok: false; error: string },
  nonce: string,
): string {
  // The payload is JSON-encoded and interpolated into a <script> tag, so
  // we must escape `<` to prevent script injection if Discord ever echoes
  // a crafted `error` query parameter back to us.
  const payload = JSON.stringify({ source: 'wawptn-discord-oauth', ...result })
    .replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Discord</title></head>
  <body style="font-family: system-ui; text-align: center; padding: 2rem;">
    <p>Vous pouvez refermer cette fenêtre.</p>
    <script nonce="${nonce}">
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(${payload}, window.location.origin);
          }
        } catch (e) { /* opener from another origin — ignore */ }
        window.close();
      })();
    </script>
  </body>
</html>`
}

export { router as discordOAuthRoutes }
