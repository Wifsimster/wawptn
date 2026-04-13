import type { Request, Response, NextFunction } from 'express'
import { authLogger } from '../../infrastructure/logger/logger.js'
import { isUserPremium } from '../../domain/subscription-service.js'

// Re-export domain primitives for backwards compatibility with existing imports
export {
  isUserPremium,
  FREE_TIER_LIMITS,
  PREMIUM_TIER_LIMITS,
} from '../../domain/subscription-service.js'

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
