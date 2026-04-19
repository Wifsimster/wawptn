import { db } from '../infrastructure/database/connection.js'

/** Tier limits for free users */
export const FREE_TIER_LIMITS = {
  maxGroups: 2,
  maxMembersPerGroup: 12,
  maxVoteHistorySessions: 10,
} as const

/** Tier limits for premium users */
export const PREMIUM_TIER_LIMITS = {
  maxMembersPerGroup: 30,
  /** Server-side cap on the history endpoint. Premium users can page
   *  up to this many sessions per request; the overall history is
   *  still unlimited via offset. */
  maxVoteHistorySessions: 100,
} as const

/** Stable error payloads for tier gates. Centralized so that route handlers
 *  and Discord/bot handlers all surface the same shape — the frontend keys
 *  off `error` to render upgrade CTAs. */
export const TIER_ERRORS = {
  freeMaxGroupsReached: () => ({
    error: 'premium_required' as const,
    message: `Free users can create max ${FREE_TIER_LIMITS.maxGroups} groups. Upgrade to premium for unlimited groups.`,
  }),
  freeMemberLimitReached: () => ({
    error: 'premium_required' as const,
    message: `This group has reached the free member limit (${FREE_TIER_LIMITS.maxMembersPerGroup}). Group owner must upgrade to premium.`,
  }),
  premiumMemberLimitReached: () => ({
    error: 'member_limit' as const,
    message: `This group has reached the maximum member limit (${PREMIUM_TIER_LIMITS.maxMembersPerGroup}).`,
  }),
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

/** Check if a user has an active premium subscription (cached, 60s TTL).
 * Admins always receive premium access regardless of subscription state.
 * Users explicitly granted premium by an admin are also considered premium. */
export async function isUserPremium(userId: string): Promise<boolean> {
  const now = Date.now()
  const cached = premiumCache.get(userId)
  if (cached && cached.expiresAt > now) return cached.value

  // Admins and admin-granted premium users always have premium access
  const user = await db('users')
    .where({ id: userId })
    .select('is_admin', 'admin_granted_premium')
    .first()
  if (user?.is_admin || user?.admin_granted_premium) {
    premiumCache.set(userId, { value: true, expiresAt: now + PREMIUM_CACHE_TTL_MS })
    return true
  }

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

/** Invalidate the cache for a specific user (call when subscription changes) */
export function invalidatePremiumCache(userId: string): void {
  premiumCache.delete(userId)
}
