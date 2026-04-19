import { db } from '../infrastructure/database/connection.js'
import { countCommonGamesForGroups } from '../infrastructure/database/common-games.js'
import { selectPersonasForGroups } from './persona-selection.js'
import { indexBy, groupBy } from '../lib/collections.js'

export interface GroupListItem {
  id: string
  name: string
  role: 'owner' | 'member'
  createdAt: Date | string
  memberCount: number
  commonGameCount: number
  lastSession: { gameName: string; gameAppId: number; closedAt: string } | null
  todayPersona: unknown | null
  discordGuildId: string | null
  discordChannelId: string | null
  discordGuildName: string | null
  discordChannelName: string | null
}

interface GroupRow {
  id: string
  name: string
  role: 'owner' | 'member'
  created_at: Date
  common_game_threshold: number | null
  discord_guild_id: string | null
  discord_channel_id: string | null
  discord_guild_name: string | null
  discord_channel_name: string | null
}

interface LastSessionRow {
  group_id: string
  winning_game_app_id: number
  winning_game_name: string
  closed_at: string
}

/**
 * Compose the "my groups" list view for a user.
 *
 * Encapsulates the batched fan-out queries (member counts, last winners,
 * common-game counts, daily personas) that previously lived inline in the
 * GET /api/groups handler. Centralizing them here keeps the route as a
 * thin transport adapter and makes the query orchestration testable in
 * isolation from Express.
 */
export async function listGroupsForUser(userId: string): Promise<GroupListItem[]> {
  const groups: GroupRow[] = await db('group_members')
    .join('groups', 'groups.id', 'group_members.group_id')
    .where('group_members.user_id', userId)
    .select('groups.*', 'group_members.role')

  if (groups.length === 0) return []

  const groupIds = groups.map((g) => g.id)

  const memberCountRows = await db('group_members')
    .whereIn('group_id', groupIds)
    .groupBy('group_id')
    .select('group_id', db.raw('COUNT(*) as count'))
  const memberCountMap = new Map<string, number>(
    memberCountRows.map((r: { group_id: string; count: string }) => [r.group_id, Number(r.count)])
  )

  const lastSessions: LastSessionRow[] = await db('voting_sessions')
    .whereIn('group_id', groupIds)
    .where('status', 'closed')
    .whereNotNull('winning_game_name')
    .distinctOn('group_id')
    .orderBy([
      { column: 'group_id' },
      { column: 'closed_at', order: 'desc' },
    ])
    .select('group_id', 'winning_game_app_id', 'winning_game_name', 'closed_at')
  const lastSessionMap = indexBy(lastSessions, (s) => s.group_id)

  const allMemberships: { group_id: string; user_id: string }[] = await db('group_members')
    .whereIn('group_id', groupIds)
    .select('group_id', 'user_id')
  const groupedMembers = groupBy(allMemberships, (m) => m.group_id)
  const memberIdsMap = new Map<string, string[]>(
    Array.from(groupedMembers, ([gid, rows]) => [gid, rows.map((r) => r.user_id)])
  )

  const commonGameCountMap = await countCommonGamesForGroups(
    groups.map((g) => {
      const memberIds = memberIdsMap.get(g.id) ?? []
      return {
        groupId: g.id,
        memberIds,
        threshold: g.common_game_threshold || memberIds.length,
      }
    })
  )

  const personaMap = await selectPersonasForGroups(groupIds)

  return groups.map((g) => {
    const last = lastSessionMap.get(g.id)
    return {
      id: g.id,
      name: g.name,
      role: g.role,
      createdAt: g.created_at,
      memberCount: memberCountMap.get(g.id) ?? 0,
      commonGameCount: commonGameCountMap.get(g.id) ?? 0,
      lastSession: last
        ? {
            gameName: last.winning_game_name,
            gameAppId: last.winning_game_app_id,
            closedAt: last.closed_at,
          }
        : null,
      todayPersona: personaMap.get(g.id) ?? null,
      discordGuildId: g.discord_guild_id ?? null,
      discordChannelId: g.discord_channel_id ?? null,
      discordGuildName: g.discord_guild_name ?? null,
      discordChannelName: g.discord_channel_name ?? null,
    }
  })
}
