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

/**
 * Sync a "simple" platform library (Epic, GOG) — storefronts that expose only
 * an opaque game id and a title, with no playtime or per-app conflict key. Each
 * game is matched to a canonical `games` row by its platform mapping, falling
 * back to a normalized-name lookup, then upserted into `user_games`. Steam is
 * handled separately because it carries playtime + new-game spotlight detection.
 */
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

    // Check if this game already has a platform mapping
    const existingMapping = await db('game_platform_ids')
      .where({ platform, platform_game_id: platformId })
      .first()

    if (existingMapping) {
      gameId = existingMapping.game_id
    } else {
      // Try to find a canonical game with matching normalized name
      const normalizedName = normalizeGameName(name)
      const existingGame = await db('games')
        .whereRaw('LOWER(REGEXP_REPLACE(canonical_name, \'[^a-zA-Z0-9\\s]\', \'\', \'g\')) = ?', [normalizedName])
        .first()

      if (existingGame) {
        gameId = existingGame.id
      } else {
        const [newGame] = await db('games')
          .insert({ canonical_name: name })
          .returning('id')
        gameId = newGame.id
      }

      await db('game_platform_ids').insert({
        game_id: gameId,
        platform,
        platform_game_id: platformId,
      })
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

// ─── Epic ───────────────────────────────────────────────────────────
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
