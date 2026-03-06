import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getSteamLoginUrl, verifySteamLogin, getPlayerSummary, getOwnedGames, getHeaderImageUrl } from '../../infrastructure/steam/steam-client.js'
import { authLogger, steamLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'

const router = Router()

// Initiate Steam OpenID login
router.get('/steam/login', (_req: Request, res: Response) => {
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
      res.redirect(`${env.CORS_ORIGIN}/login?error=auth_failed`)
      return
    }

    // Verify with Steam
    const steamId = await verifySteamLogin(params)
    if (!steamId) {
      res.redirect(`${env.CORS_ORIGIN}/login?error=auth_failed`)
      return
    }

    // Get player profile from Steam
    const profile = await getPlayerSummary(steamId)
    if (!profile) {
      res.redirect(`${env.CORS_ORIGIN}/login?error=steam_profile_failed`)
      return
    }

    // Check if user exists
    let user = await db('users').where({ steam_id: steamId }).first()

    if (!user) {
      // Create user
      const [newUser] = await db('users').insert({
        steam_id: steamId,
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        profile_url: profile.profileurl,
        library_visible: true,
      }).returning('*')
      user = newUser
      authLogger.info({ steamId, displayName: profile.personaname }, 'new user created')
    } else {
      // Update profile info
      await db('users').where({ id: user.id }).update({
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        profile_url: profile.profileurl,
        updated_at: db.fn.now(),
      })
    }

    // Create session manually
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db('sessions').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      token,
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date(),
    })

    res.cookie('wawptn.session_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    // Trigger background library sync
    syncUserLibrary(user.id, steamId).catch(err => {
      steamLogger.error({ error: String(err), steamId }, 'background library sync failed')
    })

    res.redirect(`${env.CORS_ORIGIN}/`)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'Steam callback failed')
    res.redirect(`${env.CORS_ORIGIN}/login?error=auth_failed`)
  }
})

// Get current session
router.get('/me', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies?.['wawptn.session_token']
    if (!sessionToken) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const session = await db('sessions')
      .where({ token: sessionToken })
      .where('expires_at', '>', new Date())
      .first()

    if (!session) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid session' })
      return
    }

    const user = await db('users').where({ id: session.user_id }).first()
    if (!user) {
      res.status(401).json({ error: 'unauthorized', message: 'User not found' })
      return
    }

    res.json({
      id: user.id,
      steamId: user.steam_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      libraryVisible: user.library_visible,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'get session failed')
    res.status(500).json({ error: 'internal', message: 'Failed to get session' })
  }
})

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.['wawptn.session_token']
  if (sessionToken) {
    await db('sessions').where({ token: sessionToken }).del()
  }
  res.clearCookie('wawptn.session_token')
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
    await db('user_games')
      .insert({
        user_id: userId,
        steam_app_id: game.appid,
        game_name: game.name,
        header_image_url: getHeaderImageUrl(game.appid),
        synced_at: now,
      })
      .onConflict(['user_id', 'steam_app_id'])
      .merge({
        game_name: game.name,
        header_image_url: getHeaderImageUrl(game.appid),
        synced_at: now,
      })
  }

  await db('users').where({ id: userId }).update({ library_visible: true, updated_at: now })
  steamLogger.info({ userId, steamId, gameCount: games.length }, 'library synced')
}

export { router as authRoutes, syncUserLibrary }
