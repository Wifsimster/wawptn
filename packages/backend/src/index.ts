import express from 'express'
import cors from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { env, validateEnv } from './config/env.js'
import { SESSION_COOKIE_NAME } from './config/session.js'
import { testConnection, runMigrations } from './infrastructure/database/connection.js'
import { createSocketServer } from './infrastructure/socket/socket.js'
import { startVoteScheduler } from './infrastructure/scheduler/vote-scheduler.js'
import { startAutoVoteScheduler } from './infrastructure/scheduler/auto-vote-scheduler.js'
import { startSubscriptionReconciler, stopSubscriptionReconciler } from './infrastructure/scheduler/subscription-reconciler.js'
import { logger } from './infrastructure/logger/logger.js'
import { authRoutes } from './presentation/routes/auth.routes.js'
import { groupRoutes } from './presentation/routes/group.routes.js'
import { voteRoutes } from './presentation/routes/vote.routes.js'
import { inviteRoutes } from './presentation/routes/invite.routes.js'
import { ogRoutes } from './presentation/routes/og.routes.js'
import { shareRoutes } from './presentation/routes/share.routes.js'
import { statsRoutes } from './presentation/routes/stats.routes.js'
import { requireAuth } from './presentation/middleware/auth.middleware.js'
import { requireBotAuth } from './presentation/middleware/bot-auth.middleware.js'
import { requireAdmin } from './presentation/middleware/admin.middleware.js'
import { requireSameOrigin } from './presentation/middleware/csrf.middleware.js'
import { discordRoutes, discordUserRoutes } from './presentation/routes/discord.routes.js'
import { adminRoutes } from './presentation/routes/admin.routes.js'
import { subscriptionRoutes, subscriptionWebhookRouter } from './presentation/routes/subscription.routes.js'
import { isStripeEnabled } from './infrastructure/stripe/stripe-client.js'
import { assertConfiguredPricesBelongToProduct } from './infrastructure/stripe/billing-bootstrap.js'
import { personaRoutes } from './presentation/routes/persona.routes.js'
import { koeRoutes } from './presentation/routes/koe.routes.js'
import { notificationRoutes, adminNotificationRoutes } from './presentation/routes/notification.routes.js'
import { challengeRoutes } from './presentation/routes/challenge.routes.js'
import { eventRoutes } from './presentation/routes/events.routes.js'
import { userProfileRoutes } from './presentation/routes/user-profile.routes.js'
import { startNotificationCleanup } from './infrastructure/notifications/notification-cleanup.js'
import { registerSessionEffects } from './infrastructure/effects/session-effects.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  validateEnv()

  const app = express()
  const httpServer = createServer(app)

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https://cdn.akamai.steamstatic.com', 'https://avatars.steamstatic.com'],
        connectSrc: ["'self'", 'wss:', 'ws:', 'https://avatars.steamstatic.com', 'https://cdn.akamai.steamstatic.com', 'https://koe.battistella.ovh'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))

  // gzip/brotli on text responses. Cuts HTML/JSON/CSS/JS transfer by ~60-80%.
  app.use(compression())

  // Stripe webhook — must be registered BEFORE express.json() to receive raw body
  if (isStripeEnabled()) {
    app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }), subscriptionWebhookRouter)
  }

  // Middleware
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }))
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser(env.APP_SECRET))

  // Rate limiting. Key on the signed session cookie when present so that
  // two users sharing a NAT/IP don't deplete each other's budget; fall
  // back to the client IP for unauthenticated traffic.
  //
  // The Stripe webhook is mounted upstream of this and skipped explicitly
  // here too — Stripe delivers from a small set of egress IPs and a noisy
  // morning of events from one IP can deplete the global budget, after
  // which a 429 response triggers Stripe retries forever (the dead-letter
  // would never clear).
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const token = req.signedCookies?.[SESSION_COOKIE_NAME]
      if (typeof token === 'string' && token.length > 0) return `s:${token}`
      return `ip:${req.ip ?? 'unknown'}`
    },
    skip: (req) => req.path === '/subscription/webhook' || req.path.startsWith('/subscription/webhook/'),
  })
  app.use('/api/', apiLimiter)

  // Per-user limiter for Stripe-billed endpoints. The global apiLimiter
  // already covers casual abuse, but a buggy client (or a logged-in
  // attacker) could spam customers.create / checkout.sessions.create at
  // the global cap and have us throttled org-wide by Stripe before the
  // global limit fires. Cap creation calls per session to a sensible
  // ceiling (10/min); ample for a real user retrying or comparing plans,
  // hostile to a script.
  const stripeBilledLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const token = req.signedCookies?.[SESSION_COOKIE_NAME]
      if (typeof token === 'string' && token.length > 0) return `s:${token}`
      return `ip:${req.ip ?? 'unknown'}`
    },
    // Only count POSTs (creates a Stripe-billed session); GET /me reads
    // cached local state and stays on the global limiter.
    skip: (req) => req.method !== 'POST',
  })

  const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })

  // Health endpoint
  app.get('/health', async (_req, res) => {
    try {
      const { db } = await import('./infrastructure/database/connection.js')
      await db.raw('SELECT 1')
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    } catch {
      res.status(503).json({ status: 'error', timestamp: new Date().toISOString() })
    }
  })

  // Rate limiter for auth login initiation (prevent brute force / enumeration)
  const authLoginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/auth/steam/login', authLoginLimiter)

  // Strict rate limiter for auth callback (heavy endpoint: Steam verification + DB writes)
  const authCallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/auth/steam/callback', authCallbackLimiter)

  // API Routes
  app.use('/api/auth', authRoutes)
  app.use('/api/groups', requireAuth, groupRoutes)
  app.use('/api/groups', requireAuth, voteLimiter, voteRoutes)

  // Persona route (public, read-only — shows today's bot personality)
  app.use('/api/persona', personaRoutes)

  // Koe support widget — HMAC identity signing. Auth required so
  // userHash is only issued for the caller's own session id.
  app.use('/api/koe', requireAuth, koeRoutes)

  // Notification routes (requires authenticated user)
  app.use('/api/notifications', requireAuth, notificationRoutes)

  // Challenge routes (requires authenticated user)
  app.use('/api/challenges', requireAuth, challengeRoutes)

  // User profile routes — view another member's profile and compare
  // stats. All endpoints require auth; per-endpoint co-member checks
  // live inside the route file. See issue #142 for the design.
  app.use('/api/users', requireAuth, userProfileRoutes)

  // Adoption-funnel analytics ingestion (public, best-effort user id lookup).
  // Intentionally NOT gated by requireAuth so we can track pre-login events
  // (e.g. landing-page → login clicks) and so a dead session never prevents
  // the final vote.completed event from being recorded.
  app.use('/api/events', eventRoutes)

  // Public marketing stats (unauth). Aggregates only — no PII, no per-user
  // data. Powers the LandingPage social-proof strip. Cached server-side
  // for 5 minutes; the global apiLimiter still applies upstream.
  app.use('/api/stats', statsRoutes)

  // Strict rate limiter for admin mutation endpoints (privilege grants,
  // persona CRUD, bot settings). Capped well below normal usage so a
  // compromised admin account cannot mass-mutate state, while leaving plenty
  // of headroom for legitimate panel use.
  const adminMutationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    // Only count state-changing requests; reads (GET) stay on the global
    // apiLimiter so panel browsing stays snappy.
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  })

  // Admin routes (requires authenticated admin user). requireSameOrigin
  // blocks CSRF on mutating endpoints — without it, lax-cookie sessions
  // could be coerced into granting privileges via a victim admin's browser.
  app.use('/api/admin', requireAuth, requireAdmin, requireSameOrigin, adminMutationLimiter, adminRoutes)
  app.use('/api/admin/notifications', requireAuth, requireAdmin, requireSameOrigin, adminMutationLimiter, adminNotificationRoutes)

  // Discord user-facing routes (session auth, no bot auth required)
  app.use('/api/discord', discordUserRoutes)

  // Discord bot API routes (bot auth for bot-originated requests)
  if (env.DISCORD_BOT_API_SECRET) {
    app.use('/api/discord', requireBotAuth, discordRoutes)
  }

  // Stripe subscription routes (feature-flagged). requireSameOrigin blocks
  // CSRF on /checkout and /portal — both initiate Stripe interactions and
  // create customer state, so a forged cross-site POST would be costly.
  // The webhook router is mounted earlier without requireAuth/requireSameOrigin
  // because Stripe authenticates by signed payload, not browser cookies.
  if (isStripeEnabled()) {
    app.use('/api/subscription', requireAuth, requireSameOrigin, stripeBilledLimiter, subscriptionRoutes)
  }

  // Invite preview route (public, no auth) — serves OG meta tags for Discord/social embeds
  // Must be registered BEFORE the SPA catch-all so it is matched first
  const inviteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/invite', inviteLimiter, inviteRoutes)

  // OG image route (public, no auth) — dynamic PNG for vote result previews.
  // Mounted under /api so the apiLimiter already applies; additional per-route
  // caching is set by the handler itself.
  app.use('/api', ogRoutes)

  // Share page route (public, no auth) — serves HTML with OG meta tags so
  // Discord/Twitter/etc. can render rich embeds for closed voting sessions.
  // Must be registered BEFORE the SPA catch-all so it is matched first.
  const shareLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/share', shareLimiter, shareRoutes)

  // Serve frontend in production
  if (env.NODE_ENV === 'production') {
    const frontendPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist')
    app.use(express.static(frontendPath, {
      maxAge: '1y',
      immutable: true,
      index: false,
    }))
    app.get('{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(frontendPath, 'index.html'))
    })
  }

  // Database
  const connected = await testConnection()
  if (!connected) {
    logger.fatal('Failed to connect to database')
    process.exit(1)
  }

  // Migrations must succeed before the server starts accepting traffic —
  // a partial or stale schema means request handlers will hit missing
  // columns and fail at runtime. Exit loudly so the container restarts
  // (and an operator gets paged) instead of silently serving a broken API.
  const migrated = await runMigrations()
  if (!migrated) {
    logger.fatal('Database migrations failed')
    process.exit(1)
  }

  // Socket.io
  createSocketServer(httpServer)

  // Register domain event subscribers for session side effects
  // (Socket.io emissions, Discord webhooks, in-app notifications)
  registerSessionEffects()

  // Vote scheduler (auto-close scheduled sessions)
  startVoteScheduler()

  // Auto-vote scheduler (recurring auto-created sessions)
  startAutoVoteScheduler()

  // Anti-Toko guardrail: assert every configured price belongs to the
  // expected product. Fatal in production (a wrong price ID would charge
  // customers for the wrong SKU); a warning in dev so a half-set local
  // env doesn't block running the app.
  if (isStripeEnabled()) {
    try {
      await assertConfiguredPricesBelongToProduct()
    } catch (err) {
      if (env.NODE_ENV === 'production') {
        logger.fatal({ error: String(err) }, 'stripe price/product assertion failed')
        process.exit(1)
      }
      logger.warn({ error: String(err) }, 'stripe price/product assertion failed (non-prod)')
    }
  }

  // Subscription reconciler (daily Stripe sync + grace period enforcement)
  startSubscriptionReconciler()

  // Notification cleanup (purge expired notifications weekly)
  startNotificationCleanup()

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started')
  })

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('shutting down...')
    httpServer.close()
    // Stop accepting new reconciler passes and wait for any in-flight pass
    // so we don't kill an active Stripe pagination loop or leave a Postgres
    // advisory lock orphaned mid-transaction.
    await stopSubscriptionReconciler()
    const { closeConnection } = await import('./infrastructure/database/connection.js')
    await closeConnection()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  logger.fatal({ error: String(err) }, 'failed to start server')
  process.exit(1)
})
