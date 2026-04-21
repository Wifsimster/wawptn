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

  // Discord bot (optional — feature-flagged)
  /** Discord application client ID. Used to build the bot invite URL
   *  surfaced in the group-detail "link a Discord channel" flow. Empty
   *  hides the invite button (channel binding is then only reachable if
   *  the owner already has the bot in their server). */
  DISCORD_CLIENT_ID: process.env['DISCORD_CLIENT_ID'] || '',
  /** Bot token. Used by the bot process itself; the backend only checks
   *  it's set to decide whether to expose the bot invite URL. */
  DISCORD_BOT_TOKEN: process.env['DISCORD_BOT_TOKEN'] || '',

  // LLM (optional — enables Discord bot conversational mode, OpenAI-compatible API)
  LLM_API_KEY: process.env['LLM_API_KEY'] || '',
  LLM_BASE_URL: process.env['LLM_BASE_URL'] || 'https://models.inference.ai.azure.com',
  LLM_MODEL: process.env['LLM_MODEL'] || 'gpt-4o',

  // Stripe (optional — enables premium subscriptions)
  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  STRIPE_PRICE_ID: process.env['STRIPE_PRICE_ID'] || '',

  // Koe support widget (optional — feature-flagged). When empty, the
  // identity endpoint returns 404 and the frontend skips rendering the
  // widget.
  KOE_IDENTITY_SECRET: process.env['KOE_IDENTITY_SECRET'] || '',

  // Resend (optional — enables transactional email like premium access
  // notifications). When RESEND_API_KEY is empty the email service no-ops.
  RESEND_API_KEY: process.env['RESEND_API_KEY'] || '',
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'WAWPTN <no-reply@wawptn.app>',
  /** Public URL used to build absolute links in emails (e.g. "go to your
   *  account"). Falls back to CORS_ORIGIN which points at the frontend. */
  APP_PUBLIC_URL: process.env['APP_PUBLIC_URL'] || process.env['CORS_ORIGIN'] || 'http://localhost:5173',
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
