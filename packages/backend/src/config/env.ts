import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://wawptn:wawptn_secret@localhost:5432/wawptn',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  // Better Auth
  BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'] || 'dev-secret-change-in-production-min-32-chars',
  API_URL: process.env['API_URL'] || 'http://localhost:3000',

  // Steam
  STEAM_API_KEY: process.env['STEAM_API_KEY'] || '',
}

export function validateEnv(): void {
  const required = ['BETTER_AUTH_SECRET', 'STEAM_API_KEY']

  if (env.NODE_ENV === 'production') {
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`)
      }
    }

    if (env.BETTER_AUTH_SECRET.length < 32) {
      throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
    }

    if (env.CORS_ORIGIN.includes('localhost')) {
      throw new Error('CORS_ORIGIN must not contain localhost in production')
    }

    if (env.API_URL.includes('localhost')) {
      throw new Error('API_URL must not contain localhost in production')
    }
  }
}
