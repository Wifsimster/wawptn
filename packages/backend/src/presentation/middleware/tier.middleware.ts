import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

export async function requirePremium(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subscription = await db('subscriptions')
      .where({ user_id: req.userId })
      .select('tier', 'status', 'current_period_end')
      .first()

    if (
      !subscription ||
      subscription.tier !== 'premium' ||
      subscription.status !== 'active' ||
      (subscription.current_period_end && new Date(subscription.current_period_end) < new Date())
    ) {
      res.status(403).json({ error: 'premium_required', message: 'Premium subscription required' })
      return
    }

    next()
  } catch (error) {
    authLogger.error({ error: String(error), path: req.path }, 'tier middleware: database error')
    res.status(403).json({ error: 'premium_required', message: 'Premium subscription required' })
  }
}
