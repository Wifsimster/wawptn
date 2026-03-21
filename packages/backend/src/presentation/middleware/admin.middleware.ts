import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await db('users').where({ id: req.userId }).select('is_admin').first()
    if (!user?.is_admin) {
      authLogger.warn({ userId: req.userId, path: req.path }, 'admin access denied')
      res.status(403).json({ error: 'forbidden', message: 'Admin access required' })
      return
    }
    next()
  } catch (error) {
    authLogger.error({ error: String(error), path: req.path }, 'admin middleware: database error')
    res.status(403).json({ error: 'forbidden', message: 'Admin access required' })
  }
}
