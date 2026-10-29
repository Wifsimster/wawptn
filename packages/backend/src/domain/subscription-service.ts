import { db } from '../infrastructure/database/connection.js'

export const FREE_TIER_LIMITS = {
  maxGroups: 2,
  maxMembersPerGroup: 12,
  maxVoteHistorySessions: 10,
} as const

export const PREMIUM_TIER_LIMITS = {
  maxMembersPerGroup: 30,
  maxVoteHistorySessions: 100,
} as const

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

export const PAST_DUE_GRACE_PERIOD_DAYS = 3

export function isInPastDueGrace(
  row: { status: string | null; past_due_since: Date | string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!row || row.status !== 'past_due' || !row.past_due_since) return false
  return now - new Date(row.past_due_since).getTime() < PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
}

interface CacheEntry {
  value: boolean
  expiresAt: number
}

const PREMIUM_CACHE_TTL_MS = 60_000
const premiumCache = new Map<string, CacheEntry>()

const EVICTION_INTERVAL_MS = 5 * 60_000
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of premiumCache) {
    if (entry.expiresAt <= now) premiumCache.delete(key)
  }
}, EVICTION_INTERVAL_MS).unref()

export async function isUserPremium(userId: string): Promise<boolean> {
  const now = Date.now()
  const cached = premiumCache.get(userId)
  if (cached && cached.expiresAt > now) return cached.value

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
    .select('tier', 'status', 'current_period_end', 'past_due_since')
    .first()

  let premium = true
  if (!subscription) premium = false
  else if (subscription.status === 'past_due') premium = isInPastDueGrace(subscription, now)
  else if (subscription.tier !== 'premium') premium = false
  else if (subscription.status !== 'active') premium = false
  else if (subscription.current_period_end && new Date(subscription.current_period_end) < new Date()) premium = false

  premiumCache.set(userId, { value: premium, expiresAt: now + PREMIUM_CACHE_TTL_MS })
  return premium
}

export function invalidatePremiumCache(userId: string): void {
  premiumCache.delete(userId)
}
