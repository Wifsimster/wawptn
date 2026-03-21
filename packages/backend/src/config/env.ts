import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://wawptn:wawptn_secret@localhost:5432/wawptn',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  APP_SECRET: process.env['APP_SECRET'] || 'dev-secret-change-in-production-min-32-chars',
  API_URL: process.env['API_URL'] || 'http://localhost:3000',

  // Steam
  STEAM_API_KEY: process.env['STEAM_API_KEY'] || '',

  // Epic Games (optional — feature-flagged)
  EPIC_CLIENT_ID: process.env['EPIC_CLIENT_ID'] || '',
  EPIC_CLIENT_SECRET: process.env['EPIC_CLIENT_SECRET'] || '',
  EPIC_REDIRECT_URI: process.env['EPIC_REDIRECT_URI'] || '',

  // GOG Galaxy (optional — feature-flagged)
  GOG_CLIENT_ID: process.env['GOG_CLIENT_ID'] || '',
  GOG_CLIENT_SECRET: process.env['GOG_CLIENT_SECRET'] || '',
  GOG_REDIRECT_URI: process.env['GOG_REDIRECT_URI'] || '',

  // Admin (optional — Steam ID of the default admin user)
  ADMIN_STEAM_ID: process.env['ADMIN_STEAM_ID'] || '',

  // Discord Bot (optional — feature-flagged)
  DISCORD_BOT_API_SECRET: process.env['DISCORD_BOT_API_SECRET'] || '',

  // LLM (optional — enables Discord bot conversational mode, OpenAI-compatible API)
  LLM_API_KEY: process.env['LLM_API_KEY'] || '',
  LLM_BASE_URL: process.env['LLM_BASE_URL'] || 'https://models.inference.ai.azure.com',
  LLM_MODEL: process.env['LLM_MODEL'] || 'gpt-4o',
}

export function validateEnv(): void {
  const required = ['STEAM_API_KEY']

  if (env.NODE_ENV === 'production') {
    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`)
      }
    }

    if (env.CORS_ORIGIN.includes('localhost')) {
      throw new Error('CORS_ORIGIN must not contain localhost in production')
    }

    if (env.API_URL.includes('localhost')) {
      throw new Error('API_URL must not contain localhost in production')
    }
  }
}
