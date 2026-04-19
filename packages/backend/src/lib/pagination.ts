export interface TierPagingPolicy {
  /** Free users are capped at this many items per request and CANNOT page
   *  past the head — `offset` is forced to 0 to keep them on the most-recent
   *  slice. */
  freeMaxLimit: number
  /** Premium users are capped at this many items per request, but offset is
   *  honored so they can page through the full back catalog. */
  premiumMaxLimit: number
}

export interface PagingResult {
  limit: number
  offset: number
}

/** Apply tier-based limit + offset rules.
 *
 *  Premium: limit = min(requested, premiumMax); offset honored.
 *  Free:    limit = min(requested, freeMax);    offset forced to 0.
 */
export function applyTierLimits(
  requestedLimit: number,
  requestedOffset: number,
  isPremium: boolean,
  policy: TierPagingPolicy
): PagingResult {
  const safeLimit = Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1)
  const safeOffset = Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0)

  if (isPremium) {
    return {
      limit: Math.min(safeLimit, policy.premiumMaxLimit),
      offset: safeOffset,
    }
  }
  return {
    limit: Math.min(safeLimit, policy.freeMaxLimit),
    offset: 0,
  }
}
