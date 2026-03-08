import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getSteamLoginUrl, verifySteamLogin, getPlayerSummary, getOwnedGames, getHeaderImageUrl } from '../../infrastructure/steam/steam-client.js'
import { isEpicEnabled, getEpicAuthUrl, exchangeCodeForTokens, getOwnedGames as getEpicOwnedGames, normalizeGameName } from '../../infrastructure/epic/epic-client.js'
import { isBattlenetEnabled, getBattlenetAuthUrl, exchangeCodeForTokens as exchangeBattlenetCode, getBattlenetUserInfo } from '../../infrastructure/battlenet/battlenet-client.js'
import { isGogEnabled, getGogAuthUrl, exchangeCodeForTokens as exchangeGogCode, getOwnedGames as getGogOwnedGames, normalizeGameName as normalizeGogGameName } from '../../infrastructure/gog/gog-client.js'
import { encryptToken } from '../../infrastructure/crypto/token-cipher.js'
import { authLogger, steamLogger, battlenetLogger, epicLogger, gogLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, SESSION_TOKEN_BYTES, CSRF_COOKIE_NAME } from '../../config/session.js'

const BATTLENET_LINK_STATE_COOKIE = 'wawptn.battlenet_link_state'
const EPIC_LINK_STATE_COOKIE = 'wawptn.epic_link_state'
const GOG_LINK_STATE_COOKIE = 'wawptn.gog_link_state'

const router = Router()

// Validate returnTo path against strict allowlist
function isAllowedReturnPath(path: string): boolean {
  return /^\/join\/[a-f0-9]{64}$/.test(path)
}

// Create a session for a user and return the token
async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS)

  await db('sessions').insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  })

  return { token, expiresAt }
}

// Look up session by token, return user ID if valid
async function getSessionUserId(token: string): Promise<string | null> {
  const session = await db('sessions')
    .where({ token })
    .where('expires_at', '>', new Date())
    .first()

  return session?.user_id ?? null
}

// Initiate Steam OpenID login
router.get('/steam/login', (req: Request, res: Response) => {
  const returnTo = req.query.returnTo as string | undefined
  if (returnTo && isAllowedReturnPath(returnTo)) {
    res.cookie('wawptn.invite_return', returnTo, {
      httpOnly: true,
      signed: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/api/auth/steam/callback',
    })
  }

  // CSRF protection: set a signed nonce cookie, verified on callback
  const csrfState = crypto.randomBytes(16).toString('hex')
  res.cookie(CSRF_COOKIE_NAME, csrfState, {
    httpOnly: true,
    signed: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: '/api/auth/steam/callback',
  })

  const returnUrl = `${env.API_URL}/api/auth/steam/callback`
  const loginUrl = getSteamLoginUrl(returnUrl)
  res.redirect(loginUrl)
})

// Steam OpenID callback
router.get('/steam/callback', async (req: Request, res: Response) => {
  try {
    // CSRF verification: ensure the login was initiated from our /steam/login endpoint
    const csrfState = req.signedCookies?.[CSRF_COOKIE_NAME]
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/api/auth/steam/callback' })
    if (!csrfState) {
      authLogger.warn('steam callback rejected: missing CSRF state cookie')
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
      return
    }

    const params = req.query as Record<string, string>

    // Validate return_to matches our callback URL
    const returnTo = params['openid.return_to']
    const expectedReturnTo = `${env.API_URL}/api/auth/steam/callback`
    if (returnTo !== expectedReturnTo) {
      authLogger.warn({ returnTo, expected: expectedReturnTo }, 'steam callback rejected: return_to mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
      return
    }

    // Verify with Steam
    const steamId = await verifySteamLogin(params)
    if (!steamId) {
      authLogger.warn('steam callback rejected: OpenID verification failed')
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
      return
    }

    // Get player profile from Steam
    const profile = await getPlayerSummary(steamId)
    if (!profile) {
      authLogger.warn({ steamId }, 'steam callback rejected: failed to fetch player profile')
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=steam_profile_failed`)
      return
    }

    // Find or create user via direct DB queries
    let user = await db('users').where({ steam_id: steamId }).first()

    if (user) {
      // Update existing user profile
      await db('users').where({ id: user.id }).update({
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        profile_url: profile.profileurl,
        updated_at: db.fn.now(),
      })
    } else {
      // Create new user
      const [newUser] = await db('users').insert({
        steam_id: steamId,
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        profile_url: profile.profileurl,
        email: `${steamId}@steam.wawptn.app`,
        email_verified: false,
        library_visible: true,
      }).returning('*')
      user = newUser

      // Create account link
      await db('accounts').insert({
        user_id: user.id,
        provider_id: 'steam',
        account_id: steamId,
      })

      authLogger.info({ steamId, displayName: profile.personaname }, 'new user created')
    }

    // Ensure account link exists (for pre-migration users)
    const existingAccount = await db('accounts')
      .where({ user_id: user.id, provider_id: 'steam' })
      .first()
    if (!existingAccount) {
      await db('accounts').insert({
        user_id: user.id,
        provider_id: 'steam',
        account_id: steamId,
      })
    }

    // Create session
    const session = await createSession(user.id)

    // Set signed session cookie
    res.cookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      signed: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: session.expiresAt,
      path: '/',
    })

    // Trigger background library sync
    syncUserLibrary(user.id, steamId).catch(err => {
      steamLogger.error({ error: String(err), steamId }, 'background library sync failed')
    })

    // Redirect to invite join page if cookie present, otherwise home
    const inviteReturn = req.signedCookies?.['wawptn.invite_return']
    res.clearCookie('wawptn.invite_return', { path: '/api/auth/steam/callback' })
    const redirectPath = typeof inviteReturn === 'string' && isAllowedReturnPath(inviteReturn)
      ? inviteReturn
      : '/'
    res.redirect(`${env.CORS_ORIGIN}/#${redirectPath}`)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Steam callback failed')
    res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
  }
})

// Get current session
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!token) {
      authLogger.debug('get session: no token provided')
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const userId = await getSessionUserId(token)
    if (!userId) {
      authLogger.info('get session: expired or invalid token')
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = await db('users').where({ id: userId }).first()
    if (!user) {
      authLogger.warn({ userId }, 'get session: user not found for valid session')
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    res.json({
      id: user.id,
      steamId: user.steam_id ?? null,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      libraryVisible: user.library_visible ?? true,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'get session: database error')
    res.status(500).json({ error: 'internal', message: 'Failed to get session' })
  }
})

// Get full profile with platform connections
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const userId = await getSessionUserId(token)
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = await db('users').where({ id: userId }).first()
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }

    // Get game counts per platform
    const gameCounts = await db('user_games')
      .where({ user_id: userId })
      .groupBy('platform')
      .select('platform', db.raw('COUNT(*) as count'), db.raw('MAX(synced_at) as "lastSyncedAt"'))

    const steamStats = gameCounts.find((g: { platform: string }) => g.platform === 'steam')
    const epicStats = gameCounts.find((g: { platform: string }) => g.platform === 'epic')

    // Get connected platforms from accounts table
    const accounts = await db('accounts')
      .where({ user_id: userId })
      .select('provider_id', 'account_id', 'status', 'created_at')

    const epicAccount = accounts.find((a: { provider_id: string }) => a.provider_id === 'epic')
    const epicEnabled = isEpicEnabled()
    const gogAccount = accounts.find((a: { provider_id: string }) => a.provider_id === 'gog')
    const gogEnabled = isGogEnabled()
    const gogStats = gameCounts.find((g: { platform: string }) => g.platform === 'gog')

    const platforms = [
      {
        id: 'steam',
        name: 'Steam',
        connected: accounts.some((a: { provider_id: string }) => a.provider_id === 'steam'),
        syncable: true,
        accountId: user.steam_id || null,
        gameCount: Number(steamStats?.count || 0),
        lastSyncedAt: steamStats?.lastSyncedAt || null,
        profileUrl: user.profile_url || null,
      },
      (() => {
        const bnetAccount = accounts.find((a: { provider_id: string; account_id: string }) => a.provider_id === 'battlenet')
        const battlenetEnabled = isBattlenetEnabled()
        if (bnetAccount) {
          return {
            id: 'battlenet',
            name: 'Battle.net',
            connected: true,
            linkable: true,
            syncable: false, // Battle.net API does not expose a game library endpoint
            accountId: bnetAccount.account_id,
            connectedAt: bnetAccount.created_at,
            needsRelink: bnetAccount.status === 'needs_relink',
          }
        }
        return battlenetEnabled
          ? { id: 'battlenet', name: 'Battle.net', connected: false, linkable: true, syncable: false }
          : { id: 'battlenet', name: 'Battle.net', connected: false, comingSoon: true }
      })(),
      {
        id: 'epic',
        name: 'Epic Games',
        connected: !!epicAccount,
        ...(epicEnabled
          ? {
            linkable: true,
            syncable: true,
            accountId: epicAccount?.account_id || null,
            gameCount: Number(epicStats?.count || 0),
            lastSyncedAt: epicStats?.lastSyncedAt || null,
            needsRelink: epicAccount?.status === 'needs_relink',
          }
          : { comingSoon: true }),
      },
      {
        id: 'gog',
        name: 'GOG',
        connected: !!gogAccount,
        ...(gogEnabled
          ? {
            linkable: true,
            syncable: true,
            accountId: gogAccount?.account_id || null,
            gameCount: Number(gogStats?.count || 0),
            lastSyncedAt: gogStats?.lastSyncedAt || null,
            needsRelink: gogAccount?.status === 'needs_relink',
          }
          : { comingSoon: true }),
      },
      { id: 'ubisoft', name: 'Ubisoft Connect', connected: false, comingSoon: true },
    ]

    res.json({
      id: user.id,
      steamId: user.steam_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      profileUrl: user.profile_url,
      libraryVisible: user.library_visible,
      createdAt: user.created_at,
      platforms,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'get profile failed')
    res.status(500).json({ error: 'internal', message: 'Failed to get profile' })
  }
})

// Sync current user's Steam library
router.post('/profile/sync', async (req: Request, res: Response) => {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const userId = await getSessionUserId(token)
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = await db('users').where({ id: userId }).first()
    if (!user?.steam_id) {
      res.status(400).json({ error: 'no_steam', message: 'No Steam account connected' })
      return
    }

    // Trigger background sync for Steam
    syncUserLibrary(userId, user.steam_id).catch(err => {
      steamLogger.error({ error: String(err), steamId: user.steam_id }, 'profile Steam sync failed')
    })

    // Also sync other connected platforms
    const linkedAccounts = await db('accounts')
      .where({ user_id: userId, status: 'active' })
      .whereIn('provider_id', ['epic', 'gog'])
      .select('provider_id')

    for (const account of linkedAccounts) {
      if (account.provider_id === 'epic') {
        syncEpicLibrary(userId).catch(err => {
          epicLogger.error({ error: String(err), userId }, 'profile Epic sync failed')
        })
      } else if (account.provider_id === 'gog') {
        syncGogLibrary(userId).catch(err => {
          gogLogger.error({ error: String(err), userId }, 'profile GOG sync failed')
        })
      }
    }

    res.json({ ok: true, message: 'Library sync started for all connected platforms' })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'profile sync failed')
    res.status(500).json({ error: 'internal', message: 'Failed to start sync' })
  }
})

// Initiate Battle.net OAuth account linking
router.get('/battlenet/link', async (req: Request, res: Response) => {
  try {
    if (!isBattlenetEnabled()) {
      res.status(503).json({ error: 'unavailable', message: 'Battle.net linking is not configured' })
      return
    }

    const token = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const userId = await getSessionUserId(token)
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    // Check if already linked
    const existing = await db('accounts').where({ user_id: userId, provider_id: 'battlenet' }).first()
    if (existing) {
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=already_linked`)
      return
    }

    // CSRF state: signed cookie bound to this user's session
    const state = crypto.randomBytes(16).toString('hex')
    res.cookie(BATTLENET_LINK_STATE_COOKIE, state, {
      httpOnly: true,
      signed: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/battlenet/callback',
    })

    const redirectUri = `${env.API_URL}/api/auth/battlenet/callback`
    const authUrl = getBattlenetAuthUrl(state, redirectUri)
    battlenetLogger.info({ userId }, 'initiating Battle.net account link')
    res.redirect(authUrl)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Battle.net link initiation failed')
    res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
  }
})

// Battle.net OAuth callback
router.get('/battlenet/callback', async (req: Request, res: Response) => {
  try {
    // Verify CSRF state cookie
    const storedState = req.signedCookies?.[BATTLENET_LINK_STATE_COOKIE]
    res.clearCookie(BATTLENET_LINK_STATE_COOKIE, { path: '/api/auth/battlenet/callback' })
    if (!storedState) {
      battlenetLogger.warn('battlenet callback rejected: missing state cookie')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
      return
    }

    const { code, state, error: oauthError } = req.query as Record<string, string>

    if (oauthError) {
      battlenetLogger.warn({ oauthError }, 'battlenet callback: user denied or error')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_denied`)
      return
    }

    if (state !== storedState) {
      battlenetLogger.warn('battlenet callback rejected: state mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
      return
    }

    if (!code) {
      battlenetLogger.warn('battlenet callback rejected: no authorization code')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
      return
    }

    // Verify user is still authenticated
    const sessionToken = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!sessionToken) {
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=session_expired`)
      return
    }
    const userId = await getSessionUserId(sessionToken)
    if (!userId) {
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=session_expired`)
      return
    }

    // Exchange code for tokens
    const redirectUri = `${env.API_URL}/api/auth/battlenet/callback`
    const tokens = await exchangeBattlenetCode(code, redirectUri)
    if (!tokens) {
      battlenetLogger.error('battlenet callback: token exchange failed')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
      return
    }

    // Get Battle.net user info (battletag)
    const userInfo = await getBattlenetUserInfo(tokens.access_token)
    if (!userInfo) {
      battlenetLogger.error('battlenet callback: failed to fetch user info')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
      return
    }

    // Check if this Battle.net account is already linked to another user
    const existingLink = await db('accounts')
      .where({ provider_id: 'battlenet', account_id: String(userInfo.id) })
      .first()
    if (existingLink && existingLink.user_id !== userId) {
      battlenetLogger.warn({ battlenetId: userInfo.id }, 'Battle.net account already linked to another user')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?error=account_taken`)
      return
    }

    // Upsert account link with encrypted tokens
    const accountData = {
      user_id: userId,
      provider_id: 'battlenet',
      account_id: String(userInfo.id),
      access_token: encryptToken(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope || 'openid',
      updated_at: db.fn.now(),
    }

    const existingAccount = await db('accounts')
      .where({ user_id: userId, provider_id: 'battlenet' })
      .first()

    if (existingAccount) {
      await db('accounts').where({ id: existingAccount.id }).update(accountData)
    } else {
      await db('accounts').insert(accountData)
    }

    battlenetLogger.info({ userId, battlenetId: userInfo.id, battletag: userInfo.battletag }, 'Battle.net account linked')
    res.redirect(`${env.CORS_ORIGIN}/#/profile?linked=battlenet`)
  } catch (error) {
    battlenetLogger.error({ error: String(error) }, 'Battle.net callback failed')
    res.redirect(`${env.CORS_ORIGIN}/#/profile?error=link_failed`)
  }
})

// Unlink Battle.net account
router.delete('/battlenet/link', async (req: Request, res: Response) => {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE_NAME]
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const userId = await getSessionUserId(token)
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const deleted = await db('accounts')
      .where({ user_id: userId, provider_id: 'battlenet' })
      .del()

    if (!deleted) {
      res.status(404).json({ error: 'not_found', message: 'No Battle.net account linked' })
      return
    }

    battlenetLogger.info({ userId }, 'Battle.net account unlinked')
    res.json({ ok: true })
  } catch (error) {
    battlenetLogger.error({ error: String(error) }, 'Battle.net unlink failed')
    res.status(500).json({ error: 'internal', message: 'Failed to unlink Battle.net account' })
  }
})

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.signedCookies?.[SESSION_COOKIE_NAME]
  if (token) {
    await db('sessions').where({ token }).del().catch(() => { })
  }

  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

// ─── Epic Games Account Linking ─────────────────────────────────────

// Initiate Epic Games account linking (requires authenticated user)
router.get('/epic/link', requireAuth, (req: Request, res: Response) => {
  if (!isEpicEnabled()) {
    res.status(404).json({ error: 'not_available', message: 'Epic Games linking is not configured' })
    return
  }

  // Generate state bound to the authenticated user
  const nonce = crypto.randomBytes(16).toString('hex')
  const userHash = crypto.createHmac('sha256', env.BETTER_AUTH_SECRET).update(req.userId!).digest('hex').slice(0, 16)
  const state = `${nonce}.${userHash}`

  res.cookie(EPIC_LINK_STATE_COOKIE, state, {
    httpOnly: true,
    signed: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/epic/callback',
  })

  const authUrl = getEpicAuthUrl(state)
  res.redirect(authUrl)
})

// Epic Games OAuth2 callback
router.get('/epic/callback', requireAuth, async (req: Request, res: Response) => {
  try {
    // Verify CSRF state
    const storedState = req.signedCookies?.[EPIC_LINK_STATE_COOKIE]
    res.clearCookie(EPIC_LINK_STATE_COOKIE, { path: '/api/auth/epic/callback' })

    const queryState = req.query.state as string | undefined
    if (!storedState || !queryState || storedState !== queryState) {
      authLogger.warn('Epic callback rejected: state mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=state_mismatch`)
      return
    }

    // Verify state is bound to current user
    const userHash = crypto.createHmac('sha256', env.BETTER_AUTH_SECRET).update(req.userId!).digest('hex').slice(0, 16)
    const expectedSuffix = `.${userHash}`
    if (!storedState.endsWith(expectedSuffix)) {
      authLogger.warn('Epic callback rejected: user binding mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=user_mismatch`)
      return
    }

    const code = req.query.code as string | undefined
    if (!code) {
      authLogger.warn('Epic callback rejected: no authorization code')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=no_code`)
      return
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens) {
      res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=token_exchange`)
      return
    }

    // Check if this Epic account is already linked to another user
    const existingLink = await db('accounts')
      .where({ provider_id: 'epic', account_id: tokens.account_id })
      .whereNot({ user_id: req.userId! })
      .first()

    if (existingLink) {
      authLogger.warn({ epicAccountId: tokens.account_id, userId: req.userId }, 'Epic account already linked to another user')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=already_linked`)
      return
    }

    // Store encrypted tokens in accounts table
    const now = new Date()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    await db('accounts')
      .insert({
        user_id: req.userId!,
        provider_id: 'epic',
        account_id: tokens.account_id,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        access_token_expires_at: expiresAt,
        scope: tokens.scope || 'basic_profile',
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .onConflict(['user_id', 'provider_id'])
      .merge({
        account_id: tokens.account_id,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        access_token_expires_at: expiresAt,
        scope: tokens.scope || 'basic_profile',
        status: 'active',
        updated_at: now,
      })

    epicLogger.info({ userId: req.userId, epicAccountId: tokens.account_id }, 'Epic account linked')

    // Trigger background library sync
    syncEpicLibrary(req.userId!).catch(err => {
      epicLogger.error({ error: String(err), userId: req.userId }, 'background Epic library sync failed')
    })

    res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=success`)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Epic callback failed')
    res.redirect(`${env.CORS_ORIGIN}/#/profile?epic=error&reason=internal`)
  }
})

// Unlink Epic Games account
router.post('/epic/unlink', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await db('accounts')
      .where({ user_id: req.userId!, provider_id: 'epic' })
      .del()

    if (deleted === 0) {
      res.status(404).json({ error: 'not_found', message: 'No Epic account linked' })
      return
    }

    // Remove Epic games from user library
    await db('user_games')
      .where({ user_id: req.userId!, platform: 'epic' })
      .del()

    epicLogger.info({ userId: req.userId }, 'Epic account unlinked')
    res.json({ ok: true })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Epic unlink failed')
    res.status(500).json({ error: 'internal', message: 'Failed to unlink Epic account' })
  }
})

// Sync Epic library
router.post('/epic/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await db('accounts')
      .where({ user_id: req.userId!, provider_id: 'epic' })
      .first()

    if (!account) {
      res.status(400).json({ error: 'no_epic', message: 'No Epic account connected' })
      return
    }

    if (account.status === 'needs_relink') {
      res.status(400).json({ error: 'needs_relink', message: 'Epic connection expired, please reconnect' })
      return
    }

    syncEpicLibrary(req.userId!).catch(err => {
      epicLogger.error({ error: String(err), userId: req.userId }, 'Epic sync failed')
    })

    res.json({ ok: true, message: 'Epic library sync started' })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Epic sync request failed')
    res.status(500).json({ error: 'internal', message: 'Failed to start Epic sync' })
  }
})

// ─── GOG Galaxy Account Linking ──────────────────────────────────────

// Initiate GOG account linking (requires authenticated user)
router.get('/gog/link', requireAuth, (req: Request, res: Response) => {
  if (!isGogEnabled()) {
    res.status(404).json({ error: 'not_available', message: 'GOG linking is not configured' })
    return
  }

  const nonce = crypto.randomBytes(16).toString('hex')
  const userHash = crypto.createHmac('sha256', env.BETTER_AUTH_SECRET).update(req.userId!).digest('hex').slice(0, 16)
  const state = `${nonce}.${userHash}`

  res.cookie(GOG_LINK_STATE_COOKIE, state, {
    httpOnly: true,
    signed: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/gog/callback',
  })

  const authUrl = getGogAuthUrl(state)
  res.redirect(authUrl)
})

// GOG OAuth2 callback
router.get('/gog/callback', requireAuth, async (req: Request, res: Response) => {
  try {
    const storedState = req.signedCookies?.[GOG_LINK_STATE_COOKIE]
    res.clearCookie(GOG_LINK_STATE_COOKIE, { path: '/api/auth/gog/callback' })

    const queryState = req.query.state as string | undefined
    if (!storedState || !queryState || storedState !== queryState) {
      authLogger.warn('GOG callback rejected: state mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=state_mismatch`)
      return
    }

    const userHash = crypto.createHmac('sha256', env.BETTER_AUTH_SECRET).update(req.userId!).digest('hex').slice(0, 16)
    const expectedSuffix = `.${userHash}`
    if (!storedState.endsWith(expectedSuffix)) {
      authLogger.warn('GOG callback rejected: user binding mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=user_mismatch`)
      return
    }

    const code = req.query.code as string | undefined
    if (!code) {
      authLogger.warn('GOG callback rejected: no authorization code')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=no_code`)
      return
    }

    const tokens = await exchangeGogCode(code)
    if (!tokens) {
      res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=token_exchange`)
      return
    }

    // Check if this GOG account is already linked to another user
    const existingLink = await db('accounts')
      .where({ provider_id: 'gog', account_id: tokens.user_id })
      .whereNot({ user_id: req.userId! })
      .first()

    if (existingLink) {
      authLogger.warn({ gogUserId: tokens.user_id, userId: req.userId }, 'GOG account already linked to another user')
      res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=already_linked`)
      return
    }

    const now = new Date()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    await db('accounts')
      .insert({
        user_id: req.userId!,
        provider_id: 'gog',
        account_id: tokens.user_id,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        access_token_expires_at: expiresAt,
        scope: tokens.scope || '',
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .onConflict(['user_id', 'provider_id'])
      .merge({
        account_id: tokens.user_id,
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        access_token_expires_at: expiresAt,
        scope: tokens.scope || '',
        status: 'active',
        updated_at: now,
      })

    gogLogger.info({ userId: req.userId, gogUserId: tokens.user_id }, 'GOG account linked')

    syncGogLibrary(req.userId!).catch(err => {
      gogLogger.error({ error: String(err), userId: req.userId }, 'background GOG library sync failed')
    })

    res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=success`)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'GOG callback failed')
    res.redirect(`${env.CORS_ORIGIN}/#/profile?gog=error&reason=internal`)
  }
})

// Unlink GOG account
router.post('/gog/unlink', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await db('accounts')
      .where({ user_id: req.userId!, provider_id: 'gog' })
      .del()

    if (deleted === 0) {
      res.status(404).json({ error: 'not_found', message: 'No GOG account linked' })
      return
    }

    await db('user_games')
      .where({ user_id: req.userId!, platform: 'gog' })
      .del()

    gogLogger.info({ userId: req.userId }, 'GOG account unlinked')
    res.json({ ok: true })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'GOG unlink failed')
    res.status(500).json({ error: 'internal', message: 'Failed to unlink GOG account' })
  }
})

// Sync GOG library
router.post('/gog/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const account = await db('accounts')
      .where({ user_id: req.userId!, provider_id: 'gog' })
      .first()

    if (!account) {
      res.status(400).json({ error: 'no_gog', message: 'No GOG account connected' })
      return
    }

    if (account.status === 'needs_relink') {
      res.status(400).json({ error: 'needs_relink', message: 'GOG connection expired, please reconnect' })
      return
    }

    syncGogLibrary(req.userId!).catch(err => {
      gogLogger.error({ error: String(err), userId: req.userId }, 'GOG sync failed')
    })

    res.json({ ok: true, message: 'GOG library sync started' })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'GOG sync request failed')
    res.status(500).json({ error: 'internal', message: 'Failed to start GOG sync' })
  }
})

// ─── Background Library Sync ────────────────────────────────────────

// Background Epic library sync
async function syncEpicLibrary(userId: string): Promise<void> {
  const games = await getEpicOwnedGames(userId)
  if (!games || games.length === 0) {
    epicLogger.warn({ userId }, 'no Epic games returned or token issue')
    return
  }

  const now = new Date()
  for (const game of games) {
    let gameId: string | null = null
    const normalizedName = normalizeGameName(game.displayName)

    // Check if this Epic game already has a platform mapping
    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'epic', platform_game_id: game.catalogItemId })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      // Try to find a canonical game with matching normalized name
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: game.displayName })
          .returning('id')
        gameId = newGame.id
      }

      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'epic',
        platform_game_id: game.catalogItemId,
      })
    }

    await db('user_games')
      .insert({
        user_id: userId,
        game_id: gameId,
        platform: 'epic',
        game_name: game.displayName,
        synced_at: now,
      })
      .onConflict(['user_id', 'game_id', 'platform'])
      .merge({
        game_name: game.displayName,
        synced_at: now,
      })
  }

  epicLogger.info({ userId, gameCount: games.length }, 'Epic library synced')
}

// Background Steam library sync
async function syncUserLibrary(userId: string, steamId: string): Promise<void> {
  const games = await getOwnedGames(steamId)
  if (!games) {
    await db('users').where({ id: userId }).update({ library_visible: false })
    return
  }

  if (games.length === 0) {
    steamLogger.warn({ steamId }, 'no games returned — profile may be private')
    await db('users').where({ id: userId }).update({ library_visible: false })
    return
  }

  // Upsert all games
  const now = new Date()
  for (const game of games) {
    // Find or create canonical game entry
    let gameId: string | null = null
    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'steam', platform_game_id: String(game.appid) })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      // Create canonical game + platform mapping
      const [newGame] = await db('games')
        .insert({
          canonical_name: game.name,
          cover_image_url: getHeaderImageUrl(game.appid),
        })
        .returning('id')
      gameId = newGame.id
      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'steam',
        platform_game_id: String(game.appid),
      })
    }

    await db('user_games')
      .insert({
        user_id: userId,
        steam_app_id: game.appid,
        game_id: gameId,
        platform: 'steam',
        game_name: game.name,
        header_image_url: getHeaderImageUrl(game.appid),
        synced_at: now,
      })
      .onConflict(['user_id', 'steam_app_id'])
      .merge({
        game_name: game.name,
        game_id: gameId,
        header_image_url: getHeaderImageUrl(game.appid),
        synced_at: now,
      })
  }

  await db('users').where({ id: userId }).update({ library_visible: true, updated_at: now })
  steamLogger.info({ userId, steamId, gameCount: games.length }, 'library synced')
}

// Background GOG library sync
async function syncGogLibrary(userId: string): Promise<void> {
  const games = await getGogOwnedGames(userId)
  if (!games || games.length === 0) {
    gogLogger.warn({ userId }, 'no GOG games returned or token issue')
    return
  }

  const now = new Date()
  for (const game of games) {
    let gameId: string | null = null
    const normalizedName = normalizeGogGameName(game.title)

    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'gog', platform_game_id: String(game.id) })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: game.title })
          .returning('id')
        gameId = newGame.id
      }

      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'gog',
        platform_game_id: String(game.id),
      })
    }

    await db('user_games')
      .insert({
        user_id: userId,
        game_id: gameId,
        platform: 'gog',
        game_name: game.title,
        synced_at: now,
      })
      .onConflict(['user_id', 'game_id', 'platform'])
      .merge({
        game_name: game.title,
        synced_at: now,
      })
  }

  gogLogger.info({ userId, gameCount: games.length }, 'GOG library synced')
}

export { router as authRoutes, syncUserLibrary, syncEpicLibrary, syncGogLibrary }
