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

/** Premium-feature gate registry. Adding a new gated feature = add one entry
 *  here, then mount `requirePremiumFeature('feature-name')` on the route.
 *  Routes never need to know about isUserPremium() or the message string.
 */
const PREMIUM_FEATURE_MESSAGES = {
  'auto-vote': 'Auto-vote scheduling requires a premium subscription',
  'vote-scheduling': 'Vote scheduling requires a premium subscription',
  'recommendations': 'Game recommendations require a premium subscription',
} as const

export type PremiumFeature = keyof typeof PREMIUM_FEATURE_MESSAGES

/** Express middleware factory — blocks request if user is not premium, with
 *  a feature-specific 403 message so the client can render the right CTA. */
export function requirePremiumFeature(feature: PremiumFeature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const premium = await isUserPremium(req.userId!)
      if (!premium) {
        res.status(403).json({
          error: 'premium_required',
          message: PREMIUM_FEATURE_MESSAGES[feature],
          feature,
        })
        return
      }
      next()
    } catch (error) {
      authLogger.error({ error: String(error), path: req.path, feature }, 'tier middleware: database error')
      res.status(403).json({
        error: 'premium_required',
        message: PREMIUM_FEATURE_MESSAGES[feature],
        feature,
      })
    }
  }
}
