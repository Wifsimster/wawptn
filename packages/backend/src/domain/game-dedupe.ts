import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { normalizeGameName } from './game-name.js'

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

    bucket.sort((a, b) => a.id.localeCompare(b.id))
    const winner = bucket[0]!
    const losers = bucket.slice(1)
    const loserIds = losers.map((l) => l.id)

    try {
      await db.transaction(async (trx) => {
        const userGamesRows: { user_id: string }[] = await trx('user_games')
          .whereIn('game_id', loserIds)
          .select('user_id')
        const affectedUserIds = new Set(userGamesRows.map((r) => r.user_id))

        for (const userId of affectedUserIds) {
          const ownsWinner = await trx('user_games')
            .where({ user_id: userId, game_id: winner.id })
            .first()
          if (ownsWinner) {
            await trx('user_games').where({ user_id: userId }).whereIn('game_id', loserIds).del()
          } else {
            await trx('user_games')
              .where({ user_id: userId })
              .whereIn('game_id', loserIds)
              .update({ game_id: winner.id })
          }
        }

        const userGamesUpdateCount = affectedUserIds.size
        result.userGamesUpdated += userGamesUpdateCount

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
