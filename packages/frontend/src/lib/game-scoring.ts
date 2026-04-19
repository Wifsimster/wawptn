import type { CommonGame } from '@wawptn/types'

export type PickReason = 'neverPlayed' | 'topRated' | 'mostOwned' | 'comeback'

export interface ScoredPick {
  game: CommonGame
  score: number
  reason: PickReason
}

export interface VoteHistoryEntry {
  winningGameAppId: number
  winningGameName: string
  closedAt: string
}

/**
 * Client-side scorer for "Tonight's Pick". Deterministic so it works on the
 * free tier without any backend call — the premium recommendations endpoint
 * remains the richer alternative surfaced in the sidebar. Signals used:
 *   - ownership ratio (how many members own it)
 *   - metacritic (quality bump, generous default when missing)
 *   - log-scaled recommendations (popularity)
 *   - novelty penalty if the game won recently
 *   - small bonus for MP/coop since this is a group product
 */
export function scoreGames(games: CommonGame[], history: VoteHistoryEntry[]): ScoredPick | null {
  if (games.length === 0) return null

  const now = Date.now()
  const recentWinPenalty = new Map<number, number>()
  const everPlayedIds = new Set<number>()
  for (const h of history) {
    everPlayedIds.add(h.winningGameAppId)
    const ageDays = (now - new Date(h.closedAt).getTime()) / 86_400_000
    if (ageDays <= 14) {
      recentWinPenalty.set(h.winningGameAppId, Math.max(0, 0.8 * (1 - ageDays / 14)))
    }
  }

  let best: ScoredPick | null = null
  for (const game of games) {
    const ownership = game.totalMembers > 0 ? game.ownerCount / game.totalMembers : 0
    const mc = game.metacriticScore ?? 65
    const reco = game.recommendationsTotal ?? 0
    const mpBonus = (game.isMultiplayer || game.isCoop) ? 0.25 : 0

    const score =
      1.5 * ownership +
      0.8 * (mc / 100) +
      0.7 * (Math.log1p(reco) / Math.log(100_000)) +
      mpBonus -
      (recentWinPenalty.get(game.steamAppId) ?? 0)

    if (!best || score > best.score) {
      let reason: PickReason = 'mostOwned'
      if (!everPlayedIds.has(game.steamAppId)) reason = 'neverPlayed'
      else if (mc >= 85) reason = 'topRated'
      else if ((recentWinPenalty.get(game.steamAppId) ?? 0) === 0 && everPlayedIds.has(game.steamAppId)) reason = 'comeback'

      best = { game, score, reason }
    }
  }

  return best
}
