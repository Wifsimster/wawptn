import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { createVotingSession } from './create-session.js'
import { notifyNewGameSpotlight, type SpotlightGame } from '../infrastructure/discord/spotlight-notifier.js'

const spotlightLogger = logger.child({ module: 'new-game-spotlight' })

/**
 * Discord caps a vote message at 10 games-with-buttons (see the bot's
 * embeds.ts), so a single spotlight run promotes at most this many of a
 * member's freshly acquired games. Anything beyond is left for a later sync —
 * the ledger means it won't be lost, just deferred.
 */
export const MAX_SPOTLIGHT_GAMES_PER_RUN = 10

/** A game a member's sync just added to their library for the first time. */
export interface NewlyAcquiredGame {
  steamAppId: number
  gameId: string
  gameName: string
  headerImageUrl: string | null
}

interface SpotlightGroupRow {
  id: string
  name: string
  discord_channel_id: string | null
  discord_webhook_url: string | null
}

/**
 * Pure helper: which of the just-synced app IDs are new (not previously owned).
 * Exposed for unit testing the detection rule independently of the DB.
 */
export function diffNewlyAcquired(existingAppIds: Set<number>, syncedAppIds: number[]): number[] {
  return syncedAppIds.filter((id) => !existingAppIds.has(id))
}

/**
 * Entry point called (non-blocking) from the Steam library sync once it has
 * detected that a member acquired new games. For every group the member
 * belongs to that has the spotlight enabled and a Discord destination, it
 * announces the new games and opens an interactive "qui veut jouer ?" vote.
 */
export async function processNewGameSpotlights(
  userId: string,
  newGames: NewlyAcquiredGame[],
): Promise<void> {
  if (newGames.length === 0) return

  const user = await db('users').where({ id: userId }).first()
  if (!user) return
  const ownerName: string = user.display_name || 'Un membre'

  const groups: SpotlightGroupRow[] = await db('group_members')
    .join('groups', 'groups.id', 'group_members.group_id')
    .where('group_members.user_id', userId)
    .where('groups.new_game_spotlight_enabled', true)
    .where((b) =>
      b.whereNotNull('groups.discord_channel_id').orWhereNotNull('groups.discord_webhook_url'),
    )
    .select(
      'groups.id as id',
      'groups.name as name',
      'groups.discord_channel_id as discord_channel_id',
      'groups.discord_webhook_url as discord_webhook_url',
    )

  for (const group of groups) {
    try {
      await runSpotlightForGroup(group, userId, ownerName, newGames)
    } catch (err) {
      // One group's failure (deleted channel, race, etc.) must never block the
      // others — the whole feature is best-effort.
      spotlightLogger.warn({ error: String(err), groupId: group.id, userId }, 'spotlight failed for group')
    }
  }
}

async function runSpotlightForGroup(
  group: SpotlightGroupRow,
  userId: string,
  ownerName: string,
  newGames: NewlyAcquiredGame[],
): Promise<void> {
  const members: string[] = await db('group_members').where({ group_id: group.id }).pluck('user_id')
  const memberCount = members.length
  // A spotlight asks "who wants to play?" — pointless in a solo group.
  if (memberCount < 2) return

  const candidates = newGames.slice(0, MAX_SPOTLIGHT_GAMES_PER_RUN)

  // Atomic idempotency claim: insert all candidate (group, game) rows in one
  // statement; ON CONFLICT DO NOTHING means a game already spotlighted for
  // this group (re-sync, another member's sync, second backend instance) is
  // skipped. RETURNING tells us exactly which rows we won, so we only post the
  // games this run is actually responsible for.
  const inserted: Array<{ game_id: string }> = await db('group_game_spotlights')
    .insert(
      candidates.map((g) => ({
        group_id: group.id,
        game_id: g.gameId,
        steam_app_id: g.steamAppId,
      })),
    )
    .onConflict(['group_id', 'game_id'])
    .ignore()
    .returning('game_id')

  const claimedIds = new Set(inserted.map((r) => r.game_id))
  const claimed = candidates.filter((g) => claimedIds.has(g.gameId))
  if (claimed.length === 0) return

  // How many group members already own each claimed game (the buyer included).
  const ownershipRows: Array<{ game_id: string; cnt: string | number }> = await db('user_games')
    .whereIn('user_id', members)
    .whereIn('game_id', claimed.map((g) => g.gameId))
    .groupBy('game_id')
    .select('game_id', db.raw('COUNT(DISTINCT user_id) as cnt'))

  const ownerCountByGameId = new Map<string, number>()
  for (const row of ownershipRows) {
    ownerCountByGameId.set(row.game_id, Number(row.cnt))
  }

  const spotlightGames: SpotlightGame[] = claimed.map((g) => ({
    steamAppId: g.steamAppId,
    gameName: g.gameName,
    headerImageUrl: g.headerImageUrl,
    ownerCount: ownerCountByGameId.get(g.gameId) ?? 1,
  }))

  // 1) Context announcement: who bought what, who already owns it.
  await notifyNewGameSpotlight(
    {
      id: group.id,
      name: group.name,
      discordChannelId: group.discord_channel_id,
      discordWebhookUrl: group.discord_webhook_url,
    },
    ownerName,
    memberCount,
    spotlightGames,
  )

  // 2) The interactive "qui veut jouer ?" vote, reusing the full voting
  //    machinery (Discord buttons, live tally, web votes, winner reveal).
  //    Best-effort: if a vote is already open for the group the announcement
  //    still went out, and members can react/vote on the site.
  try {
    await createVotingSession({
      groupId: group.id,
      createdBy: userId,
      participantIds: members,
      games: claimed.map((g) => ({
        steamAppId: g.steamAppId,
        gameId: g.gameId,
        gameName: g.gameName,
        headerImageUrl: g.headerImageUrl,
      })),
    })
    spotlightLogger.info(
      { groupId: group.id, userId, gameCount: claimed.length },
      'new game spotlight vote opened',
    )
  } catch (err) {
    const errorCode = (err as { errorCode?: string }).errorCode
    if (errorCode === 'conflict') {
      spotlightLogger.info(
        { groupId: group.id },
        'spotlight announced but vote skipped: a vote is already open',
      )
    } else {
      spotlightLogger.warn(
        { error: String(err), groupId: group.id },
        'spotlight vote creation failed',
      )
    }
  }
}
