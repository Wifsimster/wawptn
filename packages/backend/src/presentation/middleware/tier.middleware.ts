import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

/** Tier limits for free users */
export const FREE_TIER_LIMITS = {
  maxGroups: 2,
  maxMembersPerGroup: 8,
} as const

/** Check if a user has an active premium subscription */
export async function isUserPremium(userId: string): Promise<boolean> {
  const subscription = await db('subscriptions')
    .where({ user_id: userId })
    .select('tier', 'status', 'current_period_end')
    .first()

  if (!subscription || subscription.tier !== 'premium') return false
  if (subscription.status !== 'active') return false
  if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) return false

  return true
}

/** Express middleware — blocks request if user is not premium */
export async function requirePremium(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const premium = await isUserPremium(req.userId!)
    if (!premium) {
      res.status(403).json({ error: 'premium_required', message: 'Premium subscription required' })
      return
    }
    next()
  } catch (error) {
    authLogger.error({ error: String(error), path: req.path }, 'tier middleware: database error')
    res.status(403).json({ error: 'premium_required', message: 'Premium subscription required' })
  }
}
