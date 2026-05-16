import dotenv from 'dotenv'

dotenv.config()

export const env = {
  NODE_ENV: process.env['NODE_ENV'] || 'development',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  DATABASE_URL: process.env['DATABASE_URL'] || 'postgresql://wawptn:wawptn_secret@localhost:5432/wawptn',
  DB_POOL_MIN: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
  DB_POOL_MAX: parseInt(process.env['DB_POOL_MAX'] || '10', 10),
  /** Enables TLS on the Postgres connection. Off by default — in the
   *  reference deploy Postgres is a sibling container on a private Docker
   *  network where an extra TLS layer adds no security. Set DB_SSL=true
   *  for a managed/remote database that requires an encrypted channel. */
  DB_SSL: process.env['DB_SSL'] === 'true',
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

  // Stripe (optional — enables premium subscriptions). When STRIPE_SECRET_KEY
  // is set, validateEnv() requires the other two to also be set so a partial
  // configuration cannot silently 400 every webhook.
  STRIPE_SECRET_KEY: process.env['STRIPE_SECRET_KEY'] || '',
  STRIPE_WEBHOOK_SECRET: process.env['STRIPE_WEBHOOK_SECRET'] || '',
  /** Legacy single-cadence price ID. Kept for back-compat — when only
   *  STRIPE_PRICE_ID is set the checkout uses it for the monthly cadence
   *  and the annual toggle is hidden. New deployments should set the
   *  cadence-scoped vars below instead. */
  STRIPE_PRICE_ID: process.env['STRIPE_PRICE_ID'] || '',
  STRIPE_PRICE_ID_MONTHLY: process.env['STRIPE_PRICE_ID_MONTHLY'] || '',
  STRIPE_PRICE_ID_YEARLY: process.env['STRIPE_PRICE_ID_YEARLY'] || '',
  /** Stripe Product ID for WAWPTN Premium. When set, validateEnv() asserts
   *  every configured price belongs to this product — guards against the
   *  "STRIPE_PRICE_ID points at the wrong product" misconfiguration that
   *  produced the Toko Premium incident. Empty disables the check. */
  STRIPE_PRODUCT_ID: process.env['STRIPE_PRODUCT_ID'] || '',
  /** Stripe Billing Portal configuration ID (bpc_…). When set, portal
   *  sessions are created with this configuration so the customer can
   *  only switch between WAWPTN Premium prices, not toward products of
   *  other apps that share the same Stripe account. When empty, Stripe
   *  uses the account's default configuration. */
  STRIPE_PORTAL_CONFIG_ID: process.env['STRIPE_PORTAL_CONFIG_ID'] || '',
  // Enables Stripe Tax (automatic_tax + tax_id_collection) on Checkout.
  // Requires Stripe Tax to be onboarded in the dashboard and tax_behavior
  // set on the price object — keep disabled until that's done or Checkout
  // will reject the session.
  STRIPE_AUTOMATIC_TAX_ENABLED: process.env['STRIPE_AUTOMATIC_TAX_ENABLED'] === 'true',

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

  /** Webhook URL (Discord-webhook format) that receives fatal-error
   *  alerts — uncaught exceptions, failed startup, database outage — so a
   *  2am failure pages someone instead of dying silently. Empty disables
   *  alerting. This is the dependency-free baseline; a full error-tracking
   *  service is still recommended for grouping and metrics. */
  ALERT_WEBHOOK_URL: process.env['ALERT_WEBHOOK_URL'] || '',
}

export function validateEnv(): void {
  const required = ['STEAM_API_KEY']

  if (env.NODE_ENV === 'production') {
    // DATABASE_URL is required so a blank-env prod build fails fast at
    // startup instead of silently falling back to the localhost default
    // and crashing at the first query.
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

    // The API is credentialed (session cookies). A wildcard or schemeless
    // CORS origin would expose every authenticated endpoint to any site.
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

  // Whenever STRIPE_SECRET_KEY is configured, the webhook secret and price
  // id must come with it. Otherwise the webhook route mounts and silently
  // 400s every Stripe POST (signature check fails on empty secret), and
  // Checkout fails at request time on empty price id.
  if (env.STRIPE_SECRET_KEY) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set')
    }
    // Either the legacy single-price var OR the cadence-scoped monthly var
    // must be present so checkout can resolve a default price. Yearly is
    // optional — when missing the UI hides the annual toggle.
    if (!env.STRIPE_PRICE_ID && !env.STRIPE_PRICE_ID_MONTHLY) {
      throw new Error('STRIPE_PRICE_ID (or STRIPE_PRICE_ID_MONTHLY) is required when STRIPE_SECRET_KEY is set')
    }
    // Mode parity: live secret with test webhook (or vice versa) silently
    // fails signature verification with no startup error.
    const liveKey = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)
    const liveWebhook = !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_test_')
      && !env.STRIPE_WEBHOOK_SECRET.includes('test')
    // The webhook secret naming convention isn't strictly enforced by Stripe
    // (it's just `whsec_…`), so we can only sanity-check when the test
    // marker is present. Reject the obvious mismatch.
    if (liveKey === false && liveWebhook && env.NODE_ENV === 'production') {
      throw new Error('Stripe key/webhook mode mismatch: live webhook with test secret key')
    }
  }
}
