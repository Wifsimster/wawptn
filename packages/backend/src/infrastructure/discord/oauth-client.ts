/**
 * Discord OAuth2 + REST helpers used by the in-app "bind a Discord channel
 * at group creation" flow. Hand-rolled against native `fetch` — we do not
 * pull `discord.js` into the backend (it lives only in the bot package).
 *
 * Scope of this module:
 *   1. Build the authorize URL the browser is redirected to.
 *   2. Exchange the code returned by Discord for an access token.
 *   3. Fetch the guilds the authenticated user belongs to.
 *   4. Fetch the text channels of a specific guild via the BOT token
 *      (user OAuth does not grant channel listing).
 *
 * OAuth access tokens are NOT persisted to the DB — the token is only
 * used inside the one short-lived picker session and then discarded.
 * The picker session itself lives in an in-memory cache keyed by the
 * logged-in WAWPTN user id; see `oauth-session-cache.ts`.
 */
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const DISCORD_API = 'https://discord.com/api/v10'

/** Permissions bit for MANAGE_GUILD — only guilds where the authed user has
 *  admin-ish rights are worth surfacing in the picker. */
const MANAGE_GUILD = 0x20

export interface DiscordGuildSummary {
  id: string
  name: string
  iconUrl: string | null
  /** True if the authed user has MANAGE_GUILD on this guild. */
  canManage: boolean
}

export interface DiscordChannelSummary {
  id: string
  name: string
  /** Discord channel type. We only surface text channels (0) and
   *  announcement channels (5). */
  type: number
}

export interface DiscordOAuthToken {
  accessToken: string
  expiresAt: number
}

export function isDiscordOAuthConfigured(): boolean {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_BOT_TOKEN)
}

export function getRedirectUri(): string {
  return env.DISCORD_OAUTH_REDIRECT_URI || `${env.API_URL}/api/discord/oauth/callback`
}

/** Build the URL the browser should be redirected to in order to start the
 *  OAuth2 authorization code flow. `state` is a signed nonce that the
 *  callback verifies against the server-side session. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: 'identify guilds',
    state,
    prompt: 'consent',
  })
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

/** Exchange an authorization code for a short-lived access token. */
export async function exchangeCode(code: string): Promise<DiscordOAuthToken> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  })

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    logger.warn({ status: res.status, detail }, 'discord oauth: code exchange failed')
    throw new Error(`Discord OAuth token exchange failed: ${res.status}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
}

/** List guilds the authed user belongs to. Returns only guilds where the
 *  user has MANAGE_GUILD — there is no point offering to bind a channel
 *  the caller cannot administer. Guilds are returned sorted by name. */
export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    logger.warn({ status: res.status, detail }, 'discord oauth: fetch guilds failed')
    throw new Error(`Failed to fetch Discord guilds: ${res.status}`)
  }

  const raw = (await res.json()) as Array<{
    id: string
    name: string
    icon: string | null
    permissions: string
  }>

  return raw
    .map((g) => {
      const perms = BigInt(g.permissions)
      const canManage = (perms & BigInt(MANAGE_GUILD)) !== 0n
      return {
        id: g.id,
        name: g.name,
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        canManage,
      }
    })
    .filter((g) => g.canManage)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Fetch text channels of a guild using the BOT token. This is the
 *  standard Discord pattern — user OAuth tokens do not expose channel
 *  listings. Throws a typed error when the bot is not a member of the
 *  guild so the caller can surface an "invite the bot" UX. */
export class BotNotInGuildError extends Error {
  constructor() {
    super('Bot is not a member of this guild')
    this.name = 'BotNotInGuildError'
  }
}

export async function fetchGuildChannels(guildId: string): Promise<DiscordChannelSummary[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
  })

  if (res.status === 403 || res.status === 404) {
    throw new BotNotInGuildError()
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    logger.warn({ status: res.status, guildId, detail }, 'discord oauth: fetch channels failed')
    throw new Error(`Failed to fetch Discord channels: ${res.status}`)
  }

  const raw = (await res.json()) as Array<{ id: string; name: string; type: number }>
  // Channel types:
  //   0 = GUILD_TEXT
  //   5 = GUILD_ANNOUNCEMENT
  // Everything else (voice, category, forum, thread, stage) is filtered out —
  // the bot can only post in text-like channels.
  return raw
    .filter((c) => c.type === 0 || c.type === 5)
    .map((c) => ({ id: c.id, name: c.name, type: c.type }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Build the URL the user should visit to invite the WAWPTN bot to a
 *  guild they picked where the bot is not yet a member. */
export function buildBotInviteUrl(guildId?: string): string {
  // Permissions integer 274878221312 covers:
  //   VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS, ATTACH_FILES,
  //   READ_MESSAGE_HISTORY, USE_APPLICATION_COMMANDS, MANAGE_MESSAGES
  // — enough for vote messages, embeds, and cleanup.
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    scope: 'bot applications.commands',
    permissions: '274878221312',
  })
  if (guildId) params.set('guild_id', guildId)
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}
