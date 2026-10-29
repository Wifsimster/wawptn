import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://wawptn:wawptn_secret@localhost:5432/wawptn',
  DB_POOL_MIN: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
  DB_POOL_MAX: parseInt(process.env['DB_POOL_MAX'] || '10', 10),
  DB_SSL: process.env['DB_SSL'] === 'true',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  APP_SECRET: process.env['APP_SECRET'] || 'dev-secret-change-in-production-min-32-chars',
  API_URL: process.env['API_URL'] || 'http://localhost:3000',

  STEAM_API_KEY: process.env['STEAM_API_KEY'] || '',

  EPIC_CLIENT_ID: process.env['EPIC_CLIENT_ID'] || '',
  EPIC_CLIENT_SECRET: process.env['EPIC_CLIENT_SECRET'] || '',
  EPIC_REDIRECT_URI: process.env['EPIC_REDIRECT_URI'] || '',

  GOG_CLIENT_ID: process.env['GOG_CLIENT_ID'] || '',
  GOG_CLIENT_SECRET: process.env['GOG_CLIENT_SECRET'] || '',
  GOG_REDIRECT_URI: process.env['GOG_REDIRECT_URI'] || '',

  ADMIN_STEAM_ID: process.env['ADMIN_STEAM_ID'] || '',

  DISCORD_BOT_API_SECRET: process.env['DISCORD_BOT_API_SECRET'] || '',
  DISCORD_BOT_HTTP_URL: process.env['DISCORD_BOT_HTTP_URL'] || '',

  DISCORD_CLIENT_ID: process.env['DISCORD_CLIENT_ID'] || '',
  DISCORD_BOT_TOKEN: process.env['DISCORD_BOT_TOKEN'] || '',

  LLM_API_KEY: process.env['LLM_API_KEY'] || '',
  LLM_BASE_URL: process.env['LLM_BASE_URL'] || 'https://models.inference.ai.azure.com',
  LLM_MODEL: process.env['LLM_MODEL'] || 'gpt-4o',

  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  STRIPE_PRICE_ID: process.env['STRIPE_PRICE_ID'] || '',
  STRIPE_PRICE_ID_MONTHLY: process.env['STRIPE_PRICE_ID_MONTHLY'] || '',
  STRIPE_PRICE_ID_YEARLY: process.env['STRIPE_PRICE_ID_YEARLY'] || '',
  STRIPE_PRODUCT_ID: process.env['STRIPE_PRODUCT_ID'] || '',
  STRIPE_PORTAL_CONFIG_ID: process.env['STRIPE_PORTAL_CONFIG_ID'] || '',
  STRIPE_AUTOMATIC_TAX_ENABLED: process.env['STRIPE_AUTOMATIC_TAX_ENABLED'] === 'true',

  KOE_IDENTITY_SECRET: process.env['KOE_IDENTITY_SECRET'] || '',

  RESEND_API_KEY: process.env['RESEND_API_KEY'] || '',
  EMAIL_FROM: process.env['EMAIL_FROM'] || 'WAWPTN <no-reply@wawptn.app>',
  APP_PUBLIC_URL: process.env['APP_PUBLIC_URL'] || process.env['CORS_ORIGIN'] || 'http://localhost:5173',

  ALERT_WEBHOOK_URL: process.env['ALERT_WEBHOOK_URL'] || '',
}

export function validateEnv(): void {
  const required = ['STEAM_API_KEY']

  if (env.NODE_ENV === 'production') {
    required.push('APP_SECRET', 'DATABASE_URL')

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

    if (env.CORS_ORIGIN.trim() === '*') {
      throw new Error('CORS_ORIGIN must be an explicit origin in production, not "*"')
    }
    let corsUrl: URL
    try {
      corsUrl = new URL(env.CORS_ORIGIN)
    } catch {
      throw new Error('CORS_ORIGIN must be a valid absolute URL in production')
    }
    if (corsUrl.protocol !== 'https:') {
      throw new Error('CORS_ORIGIN must use https:// in production')
    }

    if (env.API_URL.includes('localhost')) {
      throw new Error('API_URL must not contain localhost in production')
    }
  }

  if (env.STRIPE_SECRET_KEY) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set')
    }
    if (!env.STRIPE_PRICE_ID && !env.STRIPE_PRICE_ID_MONTHLY) {
      throw new Error('STRIPE_PRICE_ID (or STRIPE_PRICE_ID_MONTHLY) is required when STRIPE_SECRET_KEY is set')
    }
    const liveKey = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)
    const liveWebhook = !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_test_')
      && !env.STRIPE_WEBHOOK_SECRET.includes('test')
    if (liveKey === false && liveWebhook && env.NODE_ENV === 'production') {
      throw new Error('Stripe key/webhook mode mismatch: live webhook with test secret key')
    }
  }
}
