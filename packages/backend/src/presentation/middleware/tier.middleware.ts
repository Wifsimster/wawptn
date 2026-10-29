import type { Request, Response, NextFunction } from 'express'
import { authLogger } from '../../infrastructure/logger/logger.js'
import { isUserPremium } from '../../domain/subscription-service.js'

export {
  isUserPremium,
  FREE_TIER_LIMITS,
  PREMIUM_TIER_LIMITS,
} from '../../domain/subscription-service.js'

export async function requirePremium(req: Request, res: Response, next: NextFunction): Promise<void> {
  let premium: boolean
  try {
    premium = await isUserPremium(req.userId!)
  } catch (error) {
    authLogger.error({ error: String(error), path: req.path }, 'tier middleware: database error')
    res.status(503).json({ error: 'service_unavailable', message: 'Subscription state unavailable, retry shortly' })
    return
  }
  if (!premium) {
    res.status(403).json({ error: 'premium_required', message: 'Premium subscription required' })
    return
  }
  next()
}

const PREMIUM_FEATURE_MESSAGES = {
  'auto-vote': 'Auto-vote scheduling requires a premium subscription',
  'vote-scheduling': 'Vote scheduling requires a premium subscription',
  'recommendations': 'Game recommendations require a premium subscription',
  'releases-digest': 'The weekly Steam releases digest requires a premium subscription',
} as const

export type PremiumFeature = keyof typeof PREMIUM_FEATURE_MESSAGES

export function requirePremiumFeature(feature: PremiumFeature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let premium: boolean
    try {
      premium = await isUserPremium(req.userId!)
    } catch (error) {
      authLogger.error({ error: String(error), path: req.path, feature }, 'tier middleware: database error')
      res.status(503).json({
        error: 'service_unavailable',
        message: 'Subscription state unavailable, retry shortly',
        feature,
      })
      return
    }
    if (!premium) {
      res.status(403).json({
        error: 'premium_required',
        message: PREMIUM_FEATURE_MESSAGES[feature],
        feature,
      })
      return
    }
    next()
  }
}
