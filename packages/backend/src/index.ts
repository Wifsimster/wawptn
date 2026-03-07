import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { env, validateEnv } from './config/env.js'
import { testConnection, runMigrations } from './infrastructure/database/connection.js'
import { createSocketServer } from './infrastructure/socket/socket.js'
import { startVoteScheduler } from './infrastructure/scheduler/vote-scheduler.js'
import { logger } from './infrastructure/logger/logger.js'
import { authRoutes } from './presentation/routes/auth.routes.js'
import { groupRoutes } from './presentation/routes/group.routes.js'
import { voteRoutes } from './presentation/routes/vote.routes.js'
import { requireAuth } from './presentation/middleware/auth.middleware.js'

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
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'https://cdn.akamai.steamstatic.com', 'https://avatars.steamstatic.com'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))

  // Middleware
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }))
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser(env.BETTER_AUTH_SECRET))

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use('/api/', apiLimiter)

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

  // API Routes
  app.use('/api/auth', authRoutes)
  app.use('/api/groups', requireAuth, groupRoutes)
  app.use('/api/groups', requireAuth, voteLimiter, voteRoutes)

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

  await runMigrations()

  // Socket.io
  createSocketServer(httpServer)

  // Vote scheduler (auto-close scheduled sessions)
  startVoteScheduler()

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'server started')
  })

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('shutting down...')
    httpServer.close()
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
