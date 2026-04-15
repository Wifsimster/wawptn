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
  /** URL of the Discord bot's internal HTTP API. When the bot is colocated
   *  with the backend this is loopback; in a split deployment it points at
   *  the bot's private address. Empty string disables bot-backed Discord
   *  posting (and the backend silently falls back to webhook-only mode). */
  DISCORD_BOT_HTTP_URL: process.env['DISCORD_BOT_HTTP_URL'] || '',

  // Discord OAuth2 + REST (optional — feature-flagged)
  /** Discord application client ID. Required for the in-app "bind a Discord
   *  channel at group creation" picker flow. Empty disables the picker and
   *  the frontend falls back to the bot's `/wawptn setup` slash command. */
  DISCORD_CLIENT_ID: process.env['DISCORD_CLIENT_ID'] || '',
  /** Discord application client secret. Paired with DISCORD_CLIENT_ID for
   *  the OAuth2 token exchange on /api/discord/oauth/callback. */
  DISCORD_CLIENT_SECRET: process.env['DISCORD_CLIENT_SECRET'] || '',
  /** Absolute redirect URI registered with the Discord application. Must
   *  match the value in the Discord developer portal exactly. Defaults to
   *  `${API_URL}/api/discord/oauth/callback` when empty. */
  DISCORD_OAUTH_REDIRECT_URI: process.env['DISCORD_OAUTH_REDIRECT_URI'] || '',
  /** Bot token used to list channels inside a guild the user picked —
   *  user OAuth tokens cannot enumerate guild channels, so we fall back
   *  to the bot token for that specific call. The bot must already be a
   *  member of the target guild (we surface an "invite the bot" hint
   *  otherwise). Empty disables the picker. */
  DISCORD_BOT_TOKEN: process.env['DISCORD_BOT_TOKEN'] || '',

  // LLM (optional — enables Discord bot conversational mode, OpenAI-compatible API)
  LLM_API_KEY: process.env['LLM_API_KEY'] || '',
  LLM_BASE_URL: process.env['LLM_BASE_URL'] || 'https://models.inference.ai.azure.com',
  LLM_MODEL: process.env['LLM_MODEL'] || 'gpt-4o',

  // Stripe (optional — enables premium subscriptions)
  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  STRIPE_PRICE_ID: process.env['STRIPE_PRICE_ID'] || '',
}

export function validateEnv(): void {
  const required = ['STEAM_API_KEY']

  if (env.NODE_ENV === 'production') {
    required.push('APP_SECRET')

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`)
      }
    }

    if (!process.env['APP_SECRET'] || process.env['APP_SECRET'].length < 32) {
      throw new Error('APP_SECRET must be at least 32 characters in production')
    }

    if (env.CORS_ORIGIN.includes('localhost')) {
      throw new Error('CORS_ORIGIN must not contain localhost in production')
    }

    if (env.API_URL.includes('localhost')) {
      throw new Error('API_URL must not contain localhost in production')
    }
  }
}
