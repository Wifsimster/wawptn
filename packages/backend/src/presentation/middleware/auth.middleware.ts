import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../../infrastructure/auth/auth.js'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })

    if (!session) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required' })
      return
    }

    req.userId = session.user.id
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' })
  }
}
