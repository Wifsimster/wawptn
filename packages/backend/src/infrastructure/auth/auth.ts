import { betterAuth } from 'better-auth'
import { PostgresDialect } from 'kysely'
import pg from 'pg'
import { env } from '../../config/env.js'

const pool = new pg.Pool({ connectionString: env.DATABASE_URL })

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.API_URL,
  basePath: '/api/auth',

  database: {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres' as const,
    casing: 'snake',
  },

  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // refresh session if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cache
    },
    modelName: 'sessions',
  },

  advanced: {
    cookiePrefix: 'wawptn',
    useSecureCookies: env.NODE_ENV === 'production',
    database: {
      generateId: 'uuid',
    },
  },

  trustedOrigins: [env.CORS_ORIGIN],

  user: {
    modelName: 'users',
    fields: {
      name: 'display_name',
      image: 'avatar_url',
    },
    additionalFields: {
      steamId: {
        type: 'string',
        fieldName: 'steam_id',
        required: false,
        returned: true,
      },
      profileUrl: {
        type: 'string',
        fieldName: 'profile_url',
        required: false,
        returned: true,
      },
      libraryVisible: {
        type: 'boolean',
        fieldName: 'library_visible',
        required: false,
        returned: true,
      },
    },
  },

  account: {
    modelName: 'accounts',
  },

  verification: {
    modelName: 'verifications',
  },
})
