import { db } from '../database/connection.js'
import { getOwnedGames, getHeaderImageUrl } from '../steam/steam-client.js'
import { getOwnedGames as getEpicOwnedGames } from '../epic/epic-client.js'
import { getOwnedGames as getGogOwnedGames } from '../gog/gog-client.js'
import { normalizeGameName } from '../../domain/game-name.js'
import { steamLogger, epicLogger, gogLogger } from '../logger/logger.js'
import type { NewlyAcquiredGame } from '../../domain/new-game-spotlight.js'
import {
  LibrarySyncCoordinator,
  type SyncedHandler,
} from '../../domain/library-sync-coordinator.js'

async function claimPlatformMapping(
  platform: string,
  platformGameId: string,
  gameId: string,
  createdGame: boolean,
): Promise<string> {
  const inserted = await db('game_platform_ids')
    .insert({ game_id: gameId, platform, platform_game_id: platformGameId })
    .onConflict(['platform', 'platform_game_id'])
    .ignore()
    .returning('game_id')
  if (inserted.length > 0) return gameId

  const winner = await db('game_platform_ids')
    .where({ platform, platform_game_id: platformGameId })
    .first()
  if (createdGame) {
    await db('games').where({ id: gameId }).del()
  }
  return winner.game_id as string
}

async function syncSimplePlatformLibrary<TGame>(opts: {
  userId: string
  platform: 'epic' | 'gog'
  label: string
  logger: { warn: (obj: object, msg: string) => void; info: (obj: object, msg: string) => void }
  fetch: (userId: string) => Promise<TGame[] | null>
  platformGameId: (game: TGame) => string
  gameName: (game: TGame) => string
}): Promise<number> {
  const { userId, platform, label, logger, fetch, platformGameId, gameName } = opts
  const games = await fetch(userId)
  if (!games || games.length === 0) {
    logger.warn({ userId }, `no ${label} games returned or token issue`)
    return 0
  }

  const now = new Date()
  for (const game of games) {
    const name = gameName(game)
    const platformId = platformGameId(game)
    let gameId: string | null = null

    const existingMapping = await db('game_platform_ids')
      .where({ platform, platform_game_id: platformId })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      const normalizedName = normalizeGameName(name)
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      let createdGame = false
      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: name })
          .returning('id')
        gameId = newGame.id
        createdGame = true
      }

      gameId = await claimPlatformMapping(platform, platformId, gameId as string, createdGame)
    }

    await db('user_games')
      .insert({
        user_id: userId,
        game_id: gameId,
        platform,
        game_name: name,
        synced_at: now,
      })
      .onConflict(['user_id', 'game_id', 'platform'])
      .merge({
        game_name: name,
        synced_at: now,
      })
  }

  logger.info({ userId, gameCount: games.length }, `${label} library synced`)
  return games.length
}

export function syncEpicLibrary(userId: string): Promise<number> {
  return syncSimplePlatformLibrary({
    userId,
    platform: 'epic',
    label: 'Epic',
    logger: epicLogger,
    fetch: getEpicOwnedGames,
    platformGameId: (game) => game.catalogItemId,
    gameName: (game) => game.displayName,
  })
}

export async function syncUserLibrary(userId: string, steamId: string): Promise<number> {
  const games = await getOwnedGames(steamId)
  if (!games) {
    steamLogger.warn({ steamId }, 'Steam library fetch failed — keeping existing library state')
    return 0
  }

  if (games.length === 0) {
    steamLogger.warn({ steamId }, 'no games returned — profile may be private')
    await db('users').where({ id: userId }).update({ library_visible: false })
    return 0
  }

  const existingAppIds = new Set<number>(
    await db('user_games').where({ user_id: userId, platform: 'steam' }).pluck('steam_app_id'),
  )
  const isFirstSync = existingAppIds.size === 0
  const newlyAcquired: NewlyAcquiredGame[] = []

  const now = new Date()
  for (const game of games) {
    let gameId: string | null = null
    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'steam', platform_game_id: String(game.appid) })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      const [newGame] = await db('games')
        .insert({
          canonical_name: game.name,
          cover_image_url: getHeaderImageUrl(game.appid),
        })
        .returning('id')
      gameId = await claimPlatformMapping('steam', String(game.appid), newGame.id, true)
    }

    await db('user_games')
      .insert({
        user_id: userId,
        steam_app_id: game.appid,
        game_id: gameId,
        platform: 'steam',
        game_name: game.name,
        header_image_url: getHeaderImageUrl(game.appid),
        playtime_forever: game.playtime_forever ?? null,
        playtime_2weeks: game.playtime_2weeks ?? null,
        synced_at: now,
      })
      .onConflict(['user_id', 'steam_app_id'])
      .merge({
        game_name: game.name,
        game_id: gameId,
        header_image_url: getHeaderImageUrl(game.appid),
        playtime_forever: db.raw('GREATEST(EXCLUDED.playtime_forever, user_games.playtime_forever)'),
        playtime_2weeks: game.playtime_2weeks ?? null,
        synced_at: now,
      })

    if (!isFirstSync && gameId && !existingAppIds.has(game.appid)) {
      newlyAcquired.push({
        steamAppId: game.appid,
        gameId,
        gameName: game.name,
        headerImageUrl: getHeaderImageUrl(game.appid),
      })
    }
  }

  await db('users').where({ id: userId }).update({ library_visible: true, updated_at: now })
  steamLogger.info({ userId, steamId, gameCount: games.length }, 'library synced')

  const { evaluateChallenges } = await import('../../domain/challenges/challenge-service.js')
  evaluateChallenges(userId, ['playtime', 'dedication', 'collection']).catch(err =>
    steamLogger.warn({ error: String(err), userId }, 'challenge evaluation after sync failed')
  )

  if (newlyAcquired.length > 0) {
    const { processNewGameSpotlights } = await import('../../domain/new-game-spotlight.js')
    processNewGameSpotlights(userId, newlyAcquired).catch(err =>
      steamLogger.warn({ error: String(err), userId }, 'new game spotlight processing failed')
    )
  }

  return games.length
}

export function syncGogLibrary(userId: string): Promise<number> {
  return syncSimplePlatformLibrary({
    userId,
    platform: 'gog',
    label: 'GOG',
    logger: gogLogger,
    fetch: getGogOwnedGames,
    platformGameId: (game) => String(game.id),
    gameName: (game) => game.title,
  })
}

export function createLibrarySyncCoordinator(): LibrarySyncCoordinator {
  return new LibrarySyncCoordinator()
    .register({
      id: 'steam',
      linked: () => true,
      sync: (userId, ctx) => syncUserLibrary(userId, ctx.member.steamId),
    })
    .register({
      id: 'epic',
      linked: (_userId, ctx) => ctx.linkedProviderIds.has('epic'),
      sync: (userId) => syncEpicLibrary(userId),
    })
    .register({
      id: 'gog',
      linked: (_userId, ctx) => ctx.linkedProviderIds.has('gog'),
      sync: (userId) => syncGogLibrary(userId),
    })
}

export function syncGroupLibraries(groupId: string, onSynced: SyncedHandler): Promise<void> {
  return createLibrarySyncCoordinator().syncGroup(groupId, onSynced)
}
