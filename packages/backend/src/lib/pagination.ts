export interface TierPagingPolicy {
  freeMaxLimit: number
  premiumMaxLimit: number
}

export interface PagingResult {
  limit: number
  offset: number
}

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
