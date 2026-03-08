import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getSteamLoginUrl, verifySteamLogin, getPlayerSummary, getOwnedGames, getHeaderImageUrl } from '../../infrastructure/steam/steam-client.js'
import { authLogger, steamLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'

const router = Router()

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_COOKIE = 'wawptn.session_token'

// Validate returnTo path against strict allowlist
function isAllowedReturnPath(path: string): boolean {
  return /^\/join\/[a-f0-9]{64}$/.test(path)
}

// Create a session for a user and return the token
async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex')
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

  const returnUrl = `${env.API_URL}/api/auth/steam/callback`
  const loginUrl = getSteamLoginUrl(returnUrl)
  res.redirect(loginUrl)
})

// Steam OpenID callback
router.get('/steam/callback', async (req: Request, res: Response) => {
  try {
    const params = req.query as Record<string, string>

    // Validate return_to matches our callback URL
    const returnTo = params['openid.return_to']
    const expectedReturnTo = `${env.API_URL}/api/auth/steam/callback`
    if (returnTo !== expectedReturnTo) {
      authLogger.warn({ returnTo, expected: expectedReturnTo }, 'return_to mismatch')
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
      return
    }

    // Verify with Steam
    const steamId = await verifySteamLogin(params)
    if (!steamId) {
      res.redirect(`${env.CORS_ORIGIN}/#/login?error=auth_failed`)
      return
    }

    // Get player profile from Steam
    const profile = await getPlayerSummary(steamId)
    if (!profile) {
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

    // Set session cookie
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
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
    const token = req.cookies?.[SESSION_COOKIE]
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
    authLogger.error({ error: String(error) }, 'get session failed')
    res.status(500).json({ error: 'internal', message: 'Failed to get session' })
  }
})

// Get full profile with platform connections
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = await db('users').where({ id: userId }).first()
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }

    // Get game count
    const gameCountResult = await db('user_games')
      .where({ user_id: userId })
      .count('* as count')
      .first()
    const gameCount = Number(gameCountResult?.count || 0)

    // Get last sync time
    const lastSync = await db('user_games')
      .where({ user_id: userId })
      .max('synced_at as lastSyncedAt')
      .first()

    // Get connected platforms from accounts table
    const accounts = await db('accounts')
      .where({ user_id: userId })
      .select('provider_id', 'account_id', 'created_at')

    const platforms = [
      {
        id: 'steam',
        name: 'Steam',
        connected: accounts.some((a: { provider_id: string }) => a.provider_id === 'steam'),
        accountId: user.steam_id || null,
        gameCount,
        lastSyncedAt: lastSync?.lastSyncedAt || null,
        profileUrl: user.profile_url || null,
      },
      { id: 'battlenet', name: 'Battle.net', connected: false, comingSoon: true },
      { id: 'epic', name: 'Epic Games', connected: false, comingSoon: true },
      { id: 'gog', name: 'GOG', connected: false, comingSoon: true },
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
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = await db('users').where({ id: userId }).first()
    if (!user?.steam_id) {
      res.status(400).json({ error: 'no_steam', message: 'No Steam account connected' })
      return
    }

    // Trigger background sync
    syncUserLibrary(userId, user.steam_id).catch(err => {
      steamLogger.error({ error: String(err), steamId: user.steam_id }, 'profile sync failed')
    })

    res.json({ ok: true, message: 'Library sync started' })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'profile sync failed')
    res.status(500).json({ error: 'internal', message: 'Failed to start sync' })
  }
})

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE]
  if (token) {
    await db('sessions').where({ token }).del().catch(() => {})
  }

  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

// Background library sync
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

export { router as authRoutes, syncUserLibrary }
