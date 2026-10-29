import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { createVotingSession } from './create-session.js'
import { notifyNewGameSpotlight, type SpotlightGame } from '../infrastructure/discord/spotlight-notifier.js'

const spotlightLogger = logger.child({ module: 'new-game-spotlight' })

export const MAX_SPOTLIGHT_GAMES_PER_RUN = 10

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

export function diffNewlyAcquired(existingAppIds: Set<number>, syncedAppIds: number[]): number[] {
  return syncedAppIds.filter((id) => !existingAppIds.has(id))
}

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
  if (memberCount < 2) return

  const candidates = newGames.slice(0, MAX_SPOTLIGHT_GAMES_PER_RUN)

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
