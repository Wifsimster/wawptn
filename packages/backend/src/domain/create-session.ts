import { db } from '../infrastructure/database/connection.js'
import { computeCommonGames, type GameFilters } from '../infrastructure/database/common-games.js'
import { logger } from '../infrastructure/logger/logger.js'
import { domainEvents } from './events/event-bus.js'

export interface CreateSessionParams {
  groupId: string
  createdBy: string
  participantIds: string[]
  filter?: string
  filters?: GameFilters
  scheduledAt?: Date | null
  excludeAppIds?: number[]
}

export interface SessionGame {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
}

export interface CreateSessionResult {
  session: {
    id: string
    groupId: string
    status: string
    createdBy: string
    scheduledAt: string | null
    createdAt: string
  }
  games: SessionGame[]
}

/**
 * Create a voting session for a group.
 * Computes common games, sorts by popularity, inserts session + participants + games,
 * then emits a `session:created` domain event that infrastructure effects subscribe to
 * (Socket.io, Discord webhook, in-app notifications).
 *
 * Throws on validation errors (with a `statusCode` property on the error).
 */
export async function createVotingSession(params: CreateSessionParams): Promise<CreateSessionResult> {
  const { groupId, createdBy, participantIds, filter, filters, scheduledAt, excludeAppIds } = params

  // Validate participantIds
  if (participantIds.length < 2) {
    const err = new Error('At least 2 participant IDs are required') as Error & { statusCode: number; errorCode: string }
    err.statusCode = 400
    err.errorCode = 'validation'
    throw err
  }

  // Validate all participant IDs are group members
  const validMembers = await db('group_members')
    .where({ group_id: groupId })
    .whereIn('user_id', participantIds)
    .pluck('user_id')

  const invalidIds = participantIds.filter(id => !validMembers.includes(id))
  if (invalidIds.length > 0) {
    const err = new Error('Some user IDs are not group members') as Error & { statusCode: number; errorCode: string; invalidIds: string[] }
    err.statusCode = 422
    err.errorCode = 'invalid_members'
    ;(err as Error & { invalidIds: string[] }).invalidIds = invalidIds
    throw err
  }

  // Get common games for the selected participants
  const group = await db('groups').where({ id: groupId }).first()
  const threshold = group?.common_game_threshold
    ? Math.min(group.common_game_threshold, validMembers.length)
    : validMembers.length

  const commonGames = await computeCommonGames(validMembers, { filter, filters, threshold })

  // Exclude specific games (e.g. the winning game from a previous session for rematch)
  const filteredCommonGames = excludeAppIds && excludeAppIds.length > 0
    ? commonGames.filter(g => !excludeAppIds.includes(g.steamAppId))
    : commonGames

  if (filteredCommonGames.length === 0) {
    const err = new Error('No common games found. Make sure all members have synced their Steam libraries and they are public.') as Error & { statusCode: number; errorCode: string }
    err.statusCode = 422
    err.errorCode = 'no_common_games'
    throw err
  }

  // Order common games by popularity in previous sessions (most voted-for first)
  const previousVoteCounts = await db('votes')
    .join('voting_sessions', 'votes.session_id', 'voting_sessions.id')
    .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed', 'votes.vote': true })
    .groupBy('votes.steam_app_id')
    .select('votes.steam_app_id', db.raw('COUNT(*) as vote_count'))

  const voteCountMap = new Map<number, number>()
  for (const row of previousVoteCounts) {
    voteCountMap.set(row.steam_app_id, Number(row.vote_count))
  }

  const selectedGames = filteredCommonGames.sort((a, b) => {
    const countA = voteCountMap.get(a.steamAppId) || 0
    const countB = voteCountMap.get(b.steamAppId) || 0
    if (countA !== countB) return countB - countA
    // Tiebreaker: aggregate playtime across group members (most played first)
    const playtimeA = a.totalPlaytime ?? 0
    const playtimeB = b.totalPlaytime ?? 0
    if (playtimeA !== playtimeB) return playtimeB - playtimeA
    return a.gameName.localeCompare(b.gameName)
  })

  // Atomic check-and-create: use a transaction with FOR UPDATE to prevent
  // concurrent requests from both passing the "no open session" check
  const session = await db.transaction(async (trx) => {
    const existingSession = await trx('voting_sessions')
      .where({ group_id: groupId, status: 'open' })
      .forUpdate()
      .first()

    if (existingSession) {
      const err = new Error('A voting session is already open') as Error & { statusCode: number; errorCode: string }
      err.statusCode = 409
      err.errorCode = 'conflict'
      throw err
    }

    const [sess] = await trx('voting_sessions').insert({
      group_id: groupId,
      status: 'open',
      created_by: createdBy,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }).returning('*')

    await trx('voting_session_participants').insert(
      validMembers.map(uid => ({
        session_id: sess.id,
        user_id: uid,
      }))
    )

    await trx('voting_session_games').insert(
      selectedGames.map(g => ({
        session_id: sess.id,
        steam_app_id: g.steamAppId,
        game_id: g.gameId || null,
        game_name: g.gameName,
        header_image_url: g.headerImageUrl,
      }))
    )

    return sess
  })

  // Emit domain event — side effects (Socket.io, Discord, in-app notifs) are
  // handled by subscribers registered in infrastructure/effects/session-effects.ts
  domainEvents.emit('session:created', {
    sessionId: session.id,
    groupId,
    createdBy,
    participantIds: validMembers,
    games: selectedGames.map(g => ({
      steamAppId: g.steamAppId,
      gameName: g.gameName,
      headerImageUrl: g.headerImageUrl,
    })),
    ...(scheduledAt ? { scheduledAt } : {}),
  })

  logger.info({ sessionId: session.id, groupId, gameCount: selectedGames.length, participants: validMembers.length }, 'voting session created')

  const result: CreateSessionResult = {
    session: {
      id: session.id,
      groupId,
      status: 'open',
      createdBy,
      scheduledAt: session.scheduled_at || null,
      createdAt: session.created_at,
    },
    games: selectedGames.map(g => ({
      steamAppId: g.steamAppId,
      gameId: g.gameId || undefined,
      gameName: g.gameName,
      headerImageUrl: g.headerImageUrl,
    })),
  }

  return result
}
