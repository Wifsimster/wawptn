import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'

// Extend Express Request for bot auth
declare global {
  namespace Express {
    interface Request {
      botAuth?: boolean
      discordUserId?: string
    }
  }
}

/**
 * Middleware for Discord bot API authentication.
 * Validates the shared secret and optionally resolves the Discord user to a WAWPTN user.
 */
export async function requireBotAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bot ')) {
      authLogger.debug({ path: req.path }, 'bot auth: no Bot authorization header')
      res.status(401).json({ error: 'unauthorized', message: 'Bot authentication required' })
      return
    }

    const secret = authHeader.slice(4)
    if (secret !== env.DISCORD_BOT_API_SECRET) {
      authLogger.info({ path: req.path }, 'bot auth: invalid secret')
      res.status(401).json({ error: 'unauthorized', message: 'Invalid bot credentials' })
      return
    }

    req.botAuth = true

    // If a Discord user ID is provided, resolve to WAWPTN user
    const discordUserId = req.headers['x-discord-user-id'] as string | undefined
    if (discordUserId) {
      req.discordUserId = discordUserId

      const link = await db('discord_links')
        .where({ discord_id: discordUserId })
        .first()

      if (link) {
        req.userId = link.user_id
      }
    }

    next()
  } catch (error) {
    authLogger.error({ error: String(error), path: req.path }, 'bot auth: error')
    res.status(500).json({ error: 'internal', message: 'Authentication error' })
  }
}
