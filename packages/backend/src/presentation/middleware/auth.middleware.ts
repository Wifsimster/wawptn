import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

const SESSION_COOKIE = 'wawptn.session_token'

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE]
    if (!token) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required' })
      return
    }

    const session = await db('sessions')
      .where({ token })
      .where('expires_at', '>', new Date())
      .first()

    if (!session) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' })
      return
    }

    req.userId = session.user_id
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' })
  }
}
