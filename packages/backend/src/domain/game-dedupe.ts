import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { normalizeGameName } from './game-name.js'

/**
 * Cross-platform game dedupe pass — part of Marcus #1 from the multi-
 * persona feature meeting.
 *
 * Background: `user_games.game_id` already points at a row in the
 * canonical `games` table, and `computeCommonGames` groups by that
 * canonical id. The problem is that the *populators* (the Steam, Epic
 * and GOG sync paths) used a weak name normalizer, so the same game
 * coming from two storefronts (Steam "Hades" + Epic "Hades") would
 * often land on TWO different canonical rows. `computeCommonGames`
 * then correctly reports that Alice and Bob don't share Hades even
 * though they do on different platforms.
 *
 * This utility does a one-shot idempotent cleanup:
 *
 *   1. Walk every row in `games`.
 *   2. Normalise its `canonical_name` through the shared normaliser.
 *   3. Group rows with the same normalised key.
 *   4. For each group with 2+ rows, pick the row with the lowest `id`
 *      (stable, deterministic) as the winner and merge the others:
 *        - Update every `user_games` row pointing at a loser to point
 *          at the winner instead.
 *        - Update every `game_platform_ids` row likewise.
 *        - Delete the loser from `games`.
 *   5. Report how many rows were merged.
 *
 * The merge runs inside a single transaction per group so a concurrent
 * sync can't interleave half-way through. Failures on one group are
 * logged and skipped — they don't abort the whole pass.
 *
 * This is safe to run multiple times. If the first pass merged all
 * name collisions, the second pass will find nothing to do.
 */

interface GameRow {
  id: string
  canonical_name: string
}

export interface DedupeResult {
  scanned: number
  groupsFound: number
  gamesMerged: number
  userGamesUpdated: number
  errors: number
}

export async function mergeDuplicateGames(): Promise<DedupeResult> {
  const result: DedupeResult = {
    scanned: 0,
    groupsFound: 0,
    gamesMerged: 0,
    userGamesUpdated: 0,
    errors: 0,
  }

  const rows: GameRow[] = await db('games').select('id', 'canonical_name')
  result.scanned = rows.length

  // Group rows by their normalised name. Empty strings (a name that
  // normalises to nothing) are skipped — we'd rather leave a ghost
  // canonical row alone than merge every nameless game into one.
  const buckets = new Map<string, GameRow[]>()
  for (const row of rows) {
    const key = normalizeGameName(row.canonical_name)
    if (!key) continue
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }

  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue
    result.groupsFound += 1

    // Deterministic winner: the row with the lexicographically smallest
    // uuid. Using the smallest id is stable across runs so repeat
    // invocations produce the same merge even if the DB returned rows
    // in a different order.
    bucket.sort((a, b) => a.id.localeCompare(b.id))
    const winner = bucket[0]!
    const losers = bucket.slice(1)
    const loserIds = losers.map((l) => l.id)

    try {
      await db.transaction(async (trx) => {
        // Repoint user_games to the winner. We use ON CONFLICT DO NOTHING-
        // like semantics by catching unique violations per row: if a user
        // already owns the winner canonical game through Steam and we try
        // to repoint their Epic copy, the composite unique constraint on
        // user_games would fire — in that case the Epic row is redundant
        // and we delete it instead.
        const userGamesRows: { user_id: string }[] = await trx('user_games')
          .whereIn('game_id', loserIds)
          .select('user_id')
        const affectedUserIds = new Set(userGamesRows.map((r) => r.user_id))

        for (const userId of affectedUserIds) {
          // If the user already owns the winner, drop the loser rows.
          const ownsWinner = await trx('user_games')
            .where({ user_id: userId, game_id: winner.id })
            .first()
          if (ownsWinner) {
            await trx('user_games').where({ user_id: userId }).whereIn('game_id', loserIds).del()
          } else {
            // Repoint: keep the loser row but swap its game_id to the
            // winner. We don't merge playtime across rows — the user
            // now points at the winner and the losers' playtime is
            // dropped (rare, minor) rather than summed, to keep the
            // transaction simple and avoid double-counting.
            await trx('user_games')
              .where({ user_id: userId })
              .whereIn('game_id', loserIds)
              .update({ game_id: winner.id })
          }
        }

        const userGamesUpdateCount = affectedUserIds.size
        result.userGamesUpdated += userGamesUpdateCount

        // Repoint game_platform_ids — if a platform link already exists
        // for the winner, drop the duplicate loser link instead.
        const platformRows: { id: string; platform: string; platform_game_id: string }[] =
          await trx('game_platform_ids')
            .whereIn('game_id', loserIds)
            .select('id', 'platform', 'platform_game_id')

        for (const link of platformRows) {
          const exists = await trx('game_platform_ids')
            .where({
              game_id: winner.id,
              platform: link.platform,
              platform_game_id: link.platform_game_id,
            })
            .first()
          if (exists) {
            await trx('game_platform_ids').where({ id: link.id }).del()
          } else {
            await trx('game_platform_ids').where({ id: link.id }).update({ game_id: winner.id })
          }
        }

        // Finally, drop the loser canonical rows.
        await trx('games').whereIn('id', loserIds).del()
        result.gamesMerged += losers.length
      })
    } catch (err) {
      result.errors += 1
      logger.error(
        { error: String(err), key, winnerId: winner.id, loserIds },
        'game dedupe: failed to merge a group',
      )
    }
  }

  logger.info(result, 'game dedupe: finished')
  return result
}
