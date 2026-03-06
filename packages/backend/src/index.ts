import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { env, validateEnv } from './config/env.js'
import { testConnection, runMigrations } from './infrastructure/database/connection.js'
import { createSocketServer } from './infrastructure/socket/socket.js'
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

  // Middleware
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }))
  app.use(express.json())
  app.use(cookieParser())

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
    app.use(express.static(frontendPath))
    app.get('{*path}', (_req, res) => {
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

  // Start server
  httpServer.listen(env.NODE_ENV === 'production' ? 80 : env.PORT, () => {
    logger.info({ port: env.NODE_ENV === 'production' ? 80 : env.PORT, env: env.NODE_ENV }, 'server started')
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
