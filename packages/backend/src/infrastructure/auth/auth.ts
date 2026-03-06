import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { env } from '../../config/env.js'
import { authLogger } from '../logger/logger.js'

const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

function createAuth() {
  return betterAuth({
    baseURL: env.API_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    emailAndPassword: {
      enabled: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    advanced: {
      cookiePrefix: 'wawptn',
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
      },
    },
    trustedOrigins: [env.CORS_ORIGIN],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            authLogger.info({ steamId: user.name }, 'new user registering via Steam')
            return { data: user }
          },
        },
      },
    },
  })
}

export const auth = createAuth()

export type Session = typeof auth.$Infer.Session
export type AuthUser = typeof auth.$Infer.Session.user
