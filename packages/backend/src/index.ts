import express from 'express'
import cors from 'cors'
import compression from 'compression'
import helmet from 'helmet'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import cron from 'node-cron'
import { env, validateEnv } from './config/env.js'
import { SESSION_COOKIE_NAME } from './config/session.js'
import { testConnection, runMigrations, db, closeConnection } from './infrastructure/database/connection.js'
import { createSocketServer } from './infrastructure/socket/socket.js'
import { startVoteScheduler } from './infrastructure/scheduler/vote-scheduler.js'
import { startAutoVoteScheduler } from './infrastructure/scheduler/auto-vote-scheduler.js'
import { startReleasesDigestScheduler } from './infrastructure/scheduler/releases-digest-scheduler.js'
import { startSubscriptionReconciler, stopSubscriptionReconciler } from './infrastructure/scheduler/subscription-reconciler.js'
import { logger } from './infrastructure/logger/logger.js'
import { sendFatalAlert } from './infrastructure/alerting/alerter.js'
import { authRoutes } from './presentation/routes/auth.routes.js'
import { groupRoutes } from './presentation/routes/group.routes.js'
import { libraryRoutes } from './presentation/routes/library.routes.js'
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

  app.set('trust proxy', 1)

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

  app.use(compression())

  if (isStripeEnabled()) {
    app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }), subscriptionWebhookRouter)
  }

  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }))
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser(env.APP_SECRET))

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
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
    skip: (req) => req.method !== 'POST',
  })

  const voteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.get('/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1')
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    } catch {
      res.status(503).json({ status: 'error', timestamp: new Date().toISOString() })
    }
  })

  const authLoginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/auth/steam/login', authLoginLimiter)

  const authCallbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/auth/steam/callback', authCallbackLimiter)

  app.use('/api/auth', authRoutes)
  app.use('/api/groups', requireAuth, groupRoutes)
  app.use('/api/groups', requireAuth, voteLimiter, voteRoutes)

  app.use('/api/library', requireAuth, requireSameOrigin, libraryRoutes)

  app.use('/api/persona', personaRoutes)

  app.use('/api/koe', requireAuth, koeRoutes)

  app.use('/api/notifications', requireAuth, notificationRoutes)

  app.use('/api/challenges', requireAuth, challengeRoutes)

  app.use('/api/users', requireAuth, userProfileRoutes)

  app.use('/api/events', eventRoutes)

  app.use('/api/stats', statsRoutes)

  const adminMutationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  })

  app.use('/api/admin', requireAuth, requireAdmin, requireSameOrigin, adminMutationLimiter, adminRoutes)
  app.use('/api/admin/notifications', requireAuth, requireAdmin, requireSameOrigin, adminMutationLimiter, adminNotificationRoutes)

  app.use('/api/discord', discordUserRoutes)

  if (env.DISCORD_BOT_API_SECRET) {
    app.use('/api/discord', requireBotAuth, discordRoutes)
  }

  if (isStripeEnabled()) {
    app.use('/api/subscription', requireAuth, requireSameOrigin, stripeBilledLimiter, subscriptionRoutes)
  }

  const inviteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/invite', inviteLimiter, inviteRoutes)

  app.use('/api', ogRoutes)

  const shareLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/share', shareLimiter, shareRoutes)

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

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = (err ?? {}) as { statusCode?: number; status?: number; message?: string; stack?: string }
    logger.error(
      { error: e.message ?? String(err), stack: e.stack, path: req.path, method: req.method },
      'unhandled request error',
    )
    if (res.headersSent) return
    const status = typeof e.statusCode === 'number' ? e.statusCode
      : typeof e.status === 'number' ? e.status
      : 500
    res.status(status).json({ error: 'internal_error' })
  })

  const connected = await testConnection()
  if (!connected) {
    logger.fatal('Failed to connect to database')
    await sendFatalAlert('database connection failed', 'testConnection() returned false at startup')
    process.exit(1)
  }

  const migrated = await runMigrations()
  if (!migrated) {
    logger.fatal('Database migrations failed')
    await sendFatalAlert('database migrations failed', 'runMigrations() returned false at startup')
    process.exit(1)
  }

  const io = createSocketServer(httpServer)

  registerSessionEffects()

  startVoteScheduler()

  startAutoVoteScheduler()

  startReleasesDigestScheduler()

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

  startSubscriptionReconciler()

  startNotificationCleanup()

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started')
  })

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'shutting down...')

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out — forcing exit')
      process.exit(1)
    }, 15_000)
    forceExit.unref()

    await new Promise<void>((resolve) => httpServer.close(() => resolve()))

    for (const task of cron.getTasks().values()) {
      try {
        task.stop()
      } catch {
      }
    }

    await new Promise<void>((resolve) => io.close(() => resolve()))

    await stopSubscriptionReconciler()

    await closeConnection()

    clearTimeout(forceExit)
    logger.info('shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM') })
  process.on('SIGINT', () => { void shutdown('SIGINT') })
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ error: String(reason) }, 'unhandled promise rejection')
  void sendFatalAlert('unhandled promise rejection', String(reason)).finally(() => process.exit(1))
})
process.on('uncaughtException', (err) => {
  logger.fatal({ error: String(err), stack: err?.stack }, 'uncaught exception')
  void sendFatalAlert('uncaught exception', err?.stack ?? String(err)).finally(() => process.exit(1))
})

main().catch(err => {
  logger.fatal({ error: String(err) }, 'failed to start server')
  void sendFatalAlert('server failed to start', err?.stack ?? String(err)).finally(() => process.exit(1))
})
