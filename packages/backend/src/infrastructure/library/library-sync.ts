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

/**
 * Per-platform library sync. These functions orchestrate the platform Web API
 * clients (Steam/Epic/GOG) and persist the owned games into the canonical
 * `games` / `game_platform_ids` / `user_games` tables. They live in the
 * infrastructure layer (not in a route file) so any caller — HTTP routes,
 * schedulers, the group fan-out coordinator — can reuse them without a
 * presentation-layer dependency.
 */

// ─── Epic ───────────────────────────────────────────────────────────
export async function syncEpicLibrary(userId: string): Promise<number> {
  const games = await getEpicOwnedGames(userId)
  if (!games || games.length === 0) {
    epicLogger.warn({ userId }, 'no Epic games returned or token issue')
    return 0
  }

  const now = new Date()
  for (const game of games) {
    let gameId: string | null = null
    const normalizedName = normalizeGameName(game.displayName)

    // Check if this Epic game already has a platform mapping
    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'epic', platform_game_id: game.catalogItemId })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      // Try to find a canonical game with matching normalized name
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: game.displayName })
          .returning('id')
        gameId = newGame.id
      }

      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'epic',
        platform_game_id: game.catalogItemId,
      })
    }

    await db('user_games')
      .insert({
        user_id: userId,
        game_id: gameId,
        platform: 'epic',
        game_name: game.displayName,
        synced_at: now,
      })
      .onConflict(['user_id', 'game_id', 'platform'])
      .merge({
        game_name: game.displayName,
        synced_at: now,
      })
  }

  epicLogger.info({ userId, gameCount: games.length }, 'Epic library synced')
  return games.length
}

// ─── Steam ──────────────────────────────────────────────────────────
export async function syncUserLibrary(userId: string, steamId: string): Promise<number> {
  const games = await getOwnedGames(steamId)
  if (!games) {
    await db('users').where({ id: userId }).update({ library_visible: false })
    return 0
  }

  if (games.length === 0) {
    steamLogger.warn({ steamId }, 'no games returned — profile may be private')
    await db('users').where({ id: userId }).update({ library_visible: false })
    return 0
  }

  // Detect freshly acquired games for the new-game spotlight. Snapshot the
  // library BEFORE the upsert so we can tell which app IDs are genuinely new.
  // The very first sync seeds the entire library, so we never spotlight on it.
  const existingAppIds = new Set<number>(
    await db('user_games').where({ user_id: userId, platform: 'steam' }).pluck('steam_app_id'),
  )
  const isFirstSync = existingAppIds.size === 0
  const newlyAcquired: NewlyAcquiredGame[] = []

  // Upsert all games
  const now = new Date()
  for (const game of games) {
    // Find or create canonical game entry
    let gameId: string | null = null
    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'steam', platform_game_id: String(game.appid) })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      // Create canonical game + platform mapping
      const [newGame] = await db('games')
        .insert({
          canonical_name: game.name,
          cover_image_url: getHeaderImageUrl(game.appid),
        })
        .returning('id')
      gameId = newGame.id
      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'steam',
        platform_game_id: String(game.appid),
      })
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

  // Evaluate playtime/collection/dedication challenges after sync (non-blocking)
  const { evaluateChallenges } = await import('../../domain/challenges/challenge-service.js')
  evaluateChallenges(userId, ['playtime', 'dedication', 'collection']).catch(err =>
    steamLogger.warn({ error: String(err), userId }, 'challenge evaluation after sync failed')
  )

  // Announce freshly acquired games into the member's groups (non-blocking).
  // Dynamic import keeps this off the module-load critical path and avoids a
  // require cycle (the spotlight module pulls in create-session, which would
  // otherwise tangle with the auth routes at load time).
  if (newlyAcquired.length > 0) {
    const { processNewGameSpotlights } = await import('../../domain/new-game-spotlight.js')
    processNewGameSpotlights(userId, newlyAcquired).catch(err =>
      steamLogger.warn({ error: String(err), userId }, 'new game spotlight processing failed')
    )
  }

  return games.length
}

// ─── GOG ────────────────────────────────────────────────────────────
export async function syncGogLibrary(userId: string): Promise<number> {
  const games = await getGogOwnedGames(userId)
  if (!games || games.length === 0) {
    gogLogger.warn({ userId }, 'no GOG games returned or token issue')
    return 0
  }

  const now = new Date()
  for (const game of games) {
    let gameId: string | null = null
    const normalizedName = normalizeGameName(game.title)

    const existingMapping = await db('game_platform_ids')
      .where({ platform: 'gog', platform_game_id: String(game.id) })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: game.title })
          .returning('id')
        gameId = newGame.id
      }

      await db('game_platform_ids').insert({
        game_id: gameId,
        platform: 'gog',
        platform_game_id: String(game.id),
      })
    }

    await db('user_games')
      .insert({
        user_id: userId,
        game_id: gameId,
        platform: 'gog',
        game_name: game.title,
        synced_at: now,
      })
      .onConflict(['user_id', 'game_id', 'platform'])
      .merge({
        game_name: game.title,
        synced_at: now,
      })
  }

  gogLogger.info({ userId, gameCount: games.length }, 'GOG library synced')
  return games.length
}

/**
 * Builds a coordinator wired with every supported platform provider. Steam is
 * always synced; Epic and GOG run only for members who have linked those
 * accounts. Adding a platform = register it here, nothing else changes.
 */
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

/** Convenience: sync every member of a group across all linked platforms. */
export function syncGroupLibraries(groupId: string, onSynced: SyncedHandler): Promise<void> {
  return createLibrarySyncCoordinator().syncGroup(groupId, onSynced)
}
