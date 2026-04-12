import type { Request, Response, NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

/** Tier limits for free users */
export const FREE_TIER_LIMITS = {
  maxGroups: 2,
  maxMembersPerGroup: 8,
} as const

/** Tier limits for premium users */
export const PREMIUM_TIER_LIMITS = {
  maxMembersPerGroup: 20,
} as const

/** In-memory cache for premium status with TTL */
interface CacheEntry {
  value: boolean
  expiresAt: number
}

const PREMIUM_CACHE_TTL_MS = 60_000 // 60 seconds
const premiumCache = new Map<string, CacheEntry>()

/** Evict expired entries periodically to prevent unbounded growth */
const EVICTION_INTERVAL_MS = 5 * 60_000 // 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of premiumCache) {
    if (entry.expiresAt <= now) premiumCache.delete(key)
  }
}, EVICTION_INTERVAL_MS).unref()

/** Check if a user has an active premium subscription (cached, 60s TTL) */
export async function isUserPremium(userId: string): Promise<boolean> {
  const now = Date.now()
  const cached = premiumCache.get(userId)
  if (cached && cached.expiresAt > now) return cached.value

  const subscription = await db('subscriptions')
    .where({ user_id: userId })
    .select('tier', 'status', 'current_period_end')
    .first()

  let premium = true
  if (!subscription || subscription.tier !== 'premium') premium = false
  else if (subscription.status !== 'active') premium = false
  else if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) premium = false

  premiumCache.set(userId, { value: premium, expiresAt: now + PREMIUM_CACHE_TTL_MS })
  return premium
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
