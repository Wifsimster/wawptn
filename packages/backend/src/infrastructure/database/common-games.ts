import { db } from './connection.js'

interface CommonGameRow {
  steamAppId: number
  gameId: string | null
  gameName: string
  headerImageUrl: string | null
  ownerCount: number
  totalPlaytime: number | null
  avgPlaytime: number | null
  isMultiplayer: boolean | null
  isCoop: boolean | null
  genres: string | null
  metacriticScore: number | null
  type: string | null
  shortDescription: string | null
  platforms: string | null
  recommendationsTotal: number | null
  releaseDate: string | null
  comingSoon: boolean | null
  controllerSupport: string | null
  isFree: boolean | null
  contentDescriptors: string | null
}

export interface GameFilters {
  multiplayer?: boolean
  coop?: boolean
  free?: boolean
}

/**
 * Compute common games for a set of user IDs.
 * Returns games owned by at least `threshold` of the provided users.
 * Groups by game_id (canonical game) to support cross-platform matching.
 */
export async function computeCommonGames(
  userIds: string[],
  options?: { filter?: string; filters?: GameFilters; threshold?: number }
): Promise<CommonGameRow[]> {
  const threshold = options?.threshold ?? userIds.length

  let query = db('user_games')
    .leftJoin('game_metadata', 'user_games.steam_app_id', 'game_metadata.steam_app_id')
    .whereIn('user_games.user_id', userIds)
    .whereNotNull('user_games.game_id')

  // Legacy string-based filter support
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

  // Structured filters support
  if (options?.filters?.multiplayer) {
    query = query.where(function () {
      this.where('game_metadata.is_multiplayer', true).orWhereNull('game_metadata.is_multiplayer')
    })
  }

  if (options?.filters?.coop) {
    query = query.where(function () {
      this.where('game_metadata.is_coop', true).orWhereNull('game_metadata.is_coop')
    })
  }

  if (options?.filters?.free) {
    query = query.where(function () {
      this.where('game_metadata.is_free', true).orWhereNull('game_metadata.is_free')
    })
  }

  const games = await query
    .groupBy('user_games.game_id', 'user_games.game_name', 'user_games.header_image_url')
    .havingRaw('COUNT(DISTINCT user_games.user_id) >= ?', [threshold])
    .select(
      db.raw('MIN(user_games.steam_app_id) as "steamAppId"'),
      'user_games.game_id as gameId',
      'user_games.game_name as gameName',
      'user_games.header_image_url as headerImageUrl',
      db.raw('COUNT(DISTINCT user_games.user_id) as "ownerCount"'),
      db.raw('COALESCE(SUM(user_games.playtime_forever), 0) as "totalPlaytime"'),
      db.raw('COALESCE(AVG(user_games.playtime_forever), 0) as "avgPlaytime"'),
      db.raw('bool_or(game_metadata.is_multiplayer) as "isMultiplayer"'),
      db.raw('bool_or(game_metadata.is_coop) as "isCoop"'),
      db.raw('MAX(game_metadata.genres::text) as "genres"'),
      db.raw('MAX(game_metadata.metacritic_score) as "metacriticScore"'),
      db.raw('MAX(game_metadata.type) as "type"'),
      db.raw('MAX(game_metadata.short_description) as "shortDescription"'),
      db.raw('MAX(game_metadata.platforms::text) as "platforms"'),
      db.raw('MAX(game_metadata.recommendations_total) as "recommendationsTotal"'),
      db.raw('MAX(game_metadata.release_date::text) as "releaseDate"'),
      db.raw('bool_or(game_metadata.coming_soon) as "comingSoon"'),
      db.raw('MAX(game_metadata.controller_support) as "controllerSupport"'),
      db.raw('bool_or(game_metadata.is_free) as "isFree"'),
      db.raw('MAX(game_metadata.content_descriptors::text) as "contentDescriptors"')
    )
    .orderByRaw('"ownerCount" DESC')

  return games.map((g: Record<string, unknown>) => ({
    steamAppId: g.steamAppId as number,
    gameId: (g.gameId as string | null) ?? null,
    gameName: g.gameName as string,
    headerImageUrl: g.headerImageUrl as string | null,
    ownerCount: Number(g.ownerCount),
    totalPlaytime: g.totalPlaytime != null ? Number(g.totalPlaytime) : null,
    avgPlaytime: g.avgPlaytime != null ? Math.round(Number(g.avgPlaytime)) : null,
    isMultiplayer: (g.isMultiplayer as boolean | null) ?? null,
    isCoop: (g.isCoop as boolean | null) ?? null,
    genres: (g.genres as string | null) ?? null,
    metacriticScore: g.metacriticScore != null ? Number(g.metacriticScore) : null,
    type: (g.type as string | null) ?? null,
    shortDescription: (g.shortDescription as string | null) ?? null,
    platforms: (g.platforms as string | null) ?? null,
    recommendationsTotal: g.recommendationsTotal != null ? Number(g.recommendationsTotal) : null,
    releaseDate: (g.releaseDate as string | null) ?? null,
    comingSoon: (g.comingSoon as boolean | null) ?? null,
    controllerSupport: (g.controllerSupport as string | null) ?? null,
    isFree: (g.isFree as boolean | null) ?? null,
    contentDescriptors: (g.contentDescriptors as string | null) ?? null,
  }))
}

/**
 * Count common games for a set of user IDs (lightweight, no metadata).
 * Returns the number of games owned by at least `threshold` users.
 */
export async function countCommonGames(
  userIds: string[],
  threshold?: number
): Promise<number> {
  const t = threshold ?? userIds.length

  const count = await db('user_games')
    .whereIn('user_id', userIds)
    .whereNotNull('game_id')
    .groupBy('game_id')
    .havingRaw('COUNT(DISTINCT user_id) >= ?', [t])
    .count('* as cnt')
    .then(rows => rows.length)

  return count
}
