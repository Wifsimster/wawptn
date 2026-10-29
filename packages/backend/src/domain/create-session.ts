import { db } from '../infrastructure/database/connection.js'
import { computeCommonGames, type GameFilters } from '../infrastructure/database/common-games.js'
import { logger } from '../infrastructure/logger/logger.js'
import { domainEvents } from './events/event-bus.js'
import { recordSessionEvent } from './session-audit-trail.js'

export interface CreateSessionParams {
  groupId: string
  createdBy: string
  participantIds: string[]
  filter?: string
  filters?: GameFilters
  scheduledAt?: Date | null
  excludeAppIds?: number[]
  games?: SessionGame[]
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

function conflictError(): Error & { statusCode: number; errorCode: string } {
  const err = new Error('A voting session is already open') as Error & {
    statusCode: number
    errorCode: string
  }
  err.statusCode = 409
  err.errorCode = 'conflict'
  return err
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505'
}

export async function createVotingSession(params: CreateSessionParams): Promise<CreateSessionResult> {
  const { groupId, createdBy, filter, filters, scheduledAt, excludeAppIds, games: explicitGames } = params
  const participantIds = [...new Set(params.participantIds)]

  if (participantIds.length < 2) {
    const err = new Error('At least 2 participant IDs are required') as Error & { statusCode: number; errorCode: string }
    err.statusCode = 400
    err.errorCode = 'validation'
    throw err
  }

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

  let selectedGames: Array<{
    steamAppId: number
    gameId?: string | null
    gameName: string
    headerImageUrl: string | null
    totalPlaytime?: number | null
  }>

  if (explicitGames && explicitGames.length > 0) {
    selectedGames = explicitGames
  } else {
    const group = await db('groups').where({ id: groupId }).first()
    const threshold = group?.common_game_threshold
      ? Math.min(group.common_game_threshold, validMembers.length)
      : validMembers.length

    const commonGames = await computeCommonGames(validMembers, { filter, filters, threshold })

    const filteredCommonGames = excludeAppIds && excludeAppIds.length > 0
      ? commonGames.filter(g => !excludeAppIds.includes(g.steamAppId))
      : commonGames

    if (filteredCommonGames.length === 0) {
      const err = new Error('No common games found. Make sure all members have synced their Steam libraries and they are public.') as Error & { statusCode: number; errorCode: string }
      err.statusCode = 422
      err.errorCode = 'no_common_games'
      throw err
    }

    const previousVoteCounts = await db('votes')
      .join('voting_sessions', 'votes.session_id', 'voting_sessions.id')
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed', 'votes.vote': true })
      .groupBy('votes.steam_app_id')
      .select('votes.steam_app_id', db.raw('COUNT(*) as vote_count'))

    const voteCountMap = new Map<number, number>()
    for (const row of previousVoteCounts) {
      voteCountMap.set(row.steam_app_id, Number(row.vote_count))
    }

    selectedGames = filteredCommonGames.sort((a, b) => {
      const countA = voteCountMap.get(a.steamAppId) || 0
      const countB = voteCountMap.get(b.steamAppId) || 0
      if (countA !== countB) return countB - countA
      const playtimeA = a.totalPlaytime ?? 0
      const playtimeB = b.totalPlaytime ?? 0
      if (playtimeA !== playtimeB) return playtimeB - playtimeA
      return a.gameName.localeCompare(b.gameName)
    })
  }

  const session = await db.transaction(async (trx) => {
    const existingSession = await trx('voting_sessions')
      .where({ group_id: groupId, status: 'open' })
      .forUpdate()
      .first()

    if (existingSession) {
      throw conflictError()
    }

    let sess
    try {
      [sess] = await trx('voting_sessions').insert({
        group_id: groupId,
        status: 'open',
        created_by: createdBy,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }).returning('*')
    } catch (err) {
      if (isUniqueViolation(err) && /uniq_voting_sessions_one_open_per_group/.test(String(err))) {
        throw conflictError()
      }
      throw err
    }

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

    await recordSessionEvent({
      sessionId: sess.id,
      event: 'session_created',
      actorId: createdBy,
      metadata: {
        groupId,
        participantIds: validMembers,
        gameCount: selectedGames.length,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        filter: filter ?? null,
      },
      trx,
    })

    return sess
  })

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
