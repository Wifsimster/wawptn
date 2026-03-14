import { db } from '../infrastructure/database/connection.js'
import { computeCommonGames } from '../infrastructure/database/common-games.js'
import { getIO } from '../infrastructure/socket/socket.js'
import { notifySessionCreated } from '../infrastructure/discord/notifier.js'
import { logger } from '../infrastructure/logger/logger.js'

export interface CreateSessionParams {
  groupId: string
  createdBy: string
  participantIds: string[]
  filter?: string
  scheduledAt?: Date | null
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
 * emits Socket.io event, and notifies Discord webhook.
 *
 * Throws on validation errors (with a `statusCode` property on the error).
 */
export async function createVotingSession(params: CreateSessionParams): Promise<CreateSessionResult> {
  const { groupId, createdBy, participantIds, filter, scheduledAt } = params

  // Check no open session exists
  const existingSession = await db('voting_sessions')
    .where({ group_id: groupId, status: 'open' })
    .first()

  if (existingSession) {
    const err = new Error('A voting session is already open') as Error & { statusCode: number; errorCode: string }
    err.statusCode = 409
    err.errorCode = 'conflict'
    throw err
  }

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

  const commonGames = await computeCommonGames(validMembers, { filter, threshold })

  if (commonGames.length === 0) {
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

  const selectedGames = commonGames.sort((a, b) => {
    const countA = voteCountMap.get(a.steamAppId) || 0
    const countB = voteCountMap.get(b.steamAppId) || 0
    if (countA !== countB) return countB - countA
    return a.gameName.localeCompare(b.gameName)
  })

  // Create session
  const [session] = await db('voting_sessions').insert({
    group_id: groupId,
    status: 'open',
    created_by: createdBy,
    ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
  }).returning('*')

  // Insert session participants
  await db('voting_session_participants').insert(
    validMembers.map(uid => ({
      session_id: session.id,
      user_id: uid,
    }))
  )

  // Insert session games
  await db('voting_session_games').insert(
    selectedGames.map(g => ({
      session_id: session.id,
      steam_app_id: g.steamAppId,
      game_id: g.gameId || null,
      game_name: g.gameName,
      header_image_url: g.headerImageUrl,
    }))
  )

  // Notify group (include participantIds so frontend can filter)
  getIO().to(`group:${groupId}`).emit('session:created', {
    sessionId: session.id,
    groupId,
    createdBy,
    participantIds: validMembers,
    ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
  })

  // Notify Discord channel (non-blocking)
  notifySessionCreated(groupId, session.id, selectedGames.map(g => ({
    gameName: g.gameName,
    steamAppId: g.steamAppId,
    headerImageUrl: g.headerImageUrl,
  }))).catch(err =>
    logger.warn({ error: String(err), groupId }, 'Discord session notification failed')
  )

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
