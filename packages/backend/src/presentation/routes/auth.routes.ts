import { Router, type Request, type Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { db } from '../../infrastructure/database/connection.js'
import { auth } from '../../infrastructure/auth/auth.js'
import { getSteamLoginUrl, verifySteamLogin, getPlayerSummary, getOwnedGames, getHeaderImageUrl } from '../../infrastructure/steam/steam-client.js'
import { authLogger, steamLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'

const router = Router()

// Validate returnTo path against strict allowlist
function isAllowedReturnPath(path: string): boolean {
  return /^\/join\/[a-f0-9]{64}$/.test(path)
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

// Steam OpenID callback — verify with Steam, then create Better Auth session
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

    // Use Better Auth's internal adapter to find/create user and session
    const ctx = await auth.$context
    const placeholderEmail = `${steamId}@steam.wawptn.app`

    // Try to find existing user via OAuth account
    let existingOAuth = await ctx.internalAdapter.findOAuthUser(
      placeholderEmail,
      steamId,
      'steam'
    )

    let userId: string

    if (!existingOAuth) {
      // Also check if user exists by steam_id (pre-migration users)
      const legacyUser = await db('users').where({ steam_id: steamId }).first()

      if (legacyUser) {
        // User exists from before Better Auth — update and create account link
        userId = legacyUser.id
        await db('users').where({ id: userId }).update({
          display_name: profile.personaname,
          avatar_url: profile.avatarfull,
          profile_url: profile.profileurl,
          email: legacyUser.email || placeholderEmail,
          updated_at: db.fn.now(),
        })

        // Ensure account link exists
        const existingAccount = await db('accounts')
          .where({ user_id: userId, provider_id: 'steam' })
          .first()
        if (!existingAccount) {
          await db('accounts').insert({
            user_id: userId,
            provider_id: 'steam',
            account_id: steamId,
          })
        }
      } else {
        // Brand new user — create via Better Auth
        const created = await ctx.internalAdapter.createOAuthUser(
          {
            name: profile.personaname,
            email: placeholderEmail,
            emailVerified: false,
            image: profile.avatarfull,
          },
          {
            providerId: 'steam',
            accountId: steamId,
          }
        )
        userId = created.user.id

        // Set custom fields
        await db('users').where({ id: userId }).update({
          steam_id: steamId,
          profile_url: profile.profileurl,
          library_visible: true,
        })

        authLogger.info({ steamId, displayName: profile.personaname }, 'new user created')
      }
    } else {
      userId = existingOAuth.user.id
      // Update profile info
      await ctx.internalAdapter.updateUser(userId, {
        name: profile.personaname,
        image: profile.avatarfull,
      })
      await db('users').where({ id: userId }).update({
        profile_url: profile.profileurl,
        updated_at: db.fn.now(),
      })
    }

    // Create Better Auth session
    const session = await ctx.internalAdapter.createSession(userId)

    // Set session cookie (matching Better Auth's expected format)
    const expiresAt = new Date(session.expiresAt)
    res.cookie('wawptn.session_token', session.token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    // Trigger background library sync
    syncUserLibrary(userId, steamId).catch(err => {
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

// Get current session — uses Better Auth's session verification
router.get('/me', async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })

    if (!session) {
      res.status(401).json({ error: 'unauthorized', message: 'No session' })
      return
    }

    const user = session.user

    res.json({
      id: user.id,
      steamId: (user as Record<string, unknown>).steamId ?? null,
      displayName: user.name,
      avatarUrl: user.image,
      libraryVisible: (user as Record<string, unknown>).libraryVisible ?? true,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'get session failed')
    res.status(500).json({ error: 'internal', message: 'Failed to get session' })
  }
})

// Logout — uses Better Auth's session revocation
router.post('/logout', async (req: Request, res: Response) => {
  try {
    await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
    })
  } catch {
    // If signOut fails (e.g. no session), still clear the cookie
  }

  res.clearCookie('wawptn.session_token', { path: '/' })
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
