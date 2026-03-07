import { db } from './connection.js'

interface CommonGameRow {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  ownerCount: number
  isMultiplayer: boolean | null
  isCoop: boolean | null
  genres: string | null
  metacriticScore: number | null
}

/**
 * Compute common games for a set of user IDs.
 * Returns games owned by at least `threshold` of the provided users.
 */
export async function computeCommonGames(
  userIds: string[],
  options?: { filter?: string; threshold?: number }
): Promise<CommonGameRow[]> {
  const threshold = options?.threshold ?? userIds.length

  let query = db('user_games')
    .leftJoin('game_metadata', 'user_games.steam_app_id', 'game_metadata.steam_app_id')
    .whereIn('user_games.user_id', userIds)

  if (options?.filter === 'multiplayer') {
    query = query.where(function () {
      this.where('game_metadata.is_multiplayer', true).orWhereNull('game_metadata.is_multiplayer')
    })
  }

  if (options?.filter === 'coop') {
    query = query.where(function () {
      this.where('game_metadata.is_coop', true).orWhereNull('game_metadata.is_coop')
    })
  }

  const games = await query
    .groupBy('user_games.steam_app_id', 'user_games.game_name', 'user_games.header_image_url')
    .havingRaw('COUNT(DISTINCT user_games.user_id) >= ?', [threshold])
    .select(
      'user_games.steam_app_id as steamAppId',
      'user_games.game_name as gameName',
      'user_games.header_image_url as headerImageUrl',
      db.raw('COUNT(DISTINCT user_games.user_id) as "ownerCount"'),
      db.raw('bool_or(game_metadata.is_multiplayer) as "isMultiplayer"'),
      db.raw('bool_or(game_metadata.is_coop) as "isCoop"'),
      db.raw('MAX(game_metadata.genres::text) as "genres"'),
      db.raw('MAX(game_metadata.metacritic_score) as "metacriticScore"')
    )
    .orderByRaw('"ownerCount" DESC')

  return games.map((g: Record<string, unknown>) => ({
    steamAppId: g.steamAppId as number,
    gameName: g.gameName as string,
    headerImageUrl: g.headerImageUrl as string | null,
    ownerCount: Number(g.ownerCount),
    isMultiplayer: (g.isMultiplayer as boolean | null) ?? null,
    isCoop: (g.isCoop as boolean | null) ?? null,
    genres: (g.genres as string | null) ?? null,
    metacriticScore: g.metacriticScore != null ? Number(g.metacriticScore) : null,
  }))
}
