import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { closeSession } from '../../domain/close-session.js'
import { createVotingSession } from '../../domain/create-session.js'
import { isUserPremium, FREE_TIER_LIMITS, PREMIUM_TIER_LIMITS } from '../middleware/tier.middleware.js'
import { requireGroupMembership } from '../middleware/group-membership.middleware.js'
import { applyTierLimits } from '../../lib/pagination.js'
import { evaluateChallenges } from '../../domain/challenges/challenge-service.js'
import { domainEvents } from '../../domain/events/event-bus.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

router.get('/:groupId/vote', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const session = await db('voting_sessions')
    .where({ group_id: groupId, status: 'open' })
    .orderBy('created_at', 'desc')
    .first()

  if (!session) {
    res.json({ session: null })
    return
  }

  const voterCount = await db('votes')
    .where({ session_id: session.id })
    .countDistinct('user_id as count')
    .first()

  const votedUserRows = await db('votes')
    .where({ session_id: session.id })
    .distinct('user_id')
    .pluck('user_id')

  const participantCount = await db('voting_session_participants')
    .where({ session_id: session.id })
    .count('* as count')
    .first()
  const totalParticipants = Number(participantCount?.count || 0)

  let totalMembers: number
  if (totalParticipants > 0) {
    totalMembers = totalParticipants
  } else {
    const memberCount = await db('group_members')
      .where({ group_id: groupId })
      .count('* as count')
      .first()
    totalMembers = Number(memberCount?.count || 0)
  }

  const isParticipant = totalParticipants === 0 || await db('voting_session_participants')
    .where({ session_id: session.id, user_id: userId })
    .first()

  const myVotes = await db('votes')
    .where({ session_id: session.id, user_id: userId })
    .select('steam_app_id as steamAppId', 'game_id as gameId', 'vote')

  const games = await db('voting_session_games')
    .leftJoin('game_metadata', 'voting_session_games.steam_app_id', 'game_metadata.steam_app_id')
    .where({ session_id: session.id })
    .select(
      'voting_session_games.steam_app_id as steamAppId',
      'voting_session_games.game_id as gameId',
      'voting_session_games.game_name as gameName',
      'voting_session_games.header_image_url as headerImageUrl',
      'game_metadata.short_description as shortDescription',
      'game_metadata.genres',
      'game_metadata.metacritic_score as metacriticScore',
      'game_metadata.platforms',
      'game_metadata.release_date as releaseDate',
      'game_metadata.controller_support as controllerSupport',
      'game_metadata.is_free as isFree',
      'game_metadata.type'
    )

  const participantIds = totalParticipants > 0
    ? await db('voting_session_participants').where({ session_id: session.id }).pluck('user_id')
    : []

  res.json({
    session: {
      id: session.id,
      groupId: session.group_id,
      status: session.status,
      createdBy: session.created_by,
      scheduledAt: session.scheduled_at || null,
      createdAt: session.created_at,
    },
    games,
    myVotes,
    voterCount: Number(voterCount?.count || 0),
    totalMembers,
    isParticipant: !!isParticipant,
    participantIds,
    votedUserIds: votedUserRows,
  })
})

router.post('/:groupId/vote', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const { filter, filters, participantIds, scheduledAt } = req.body as { filter?: string; filters?: { multiplayer?: boolean; coop?: boolean; free?: boolean }; participantIds: string[]; scheduledAt?: string }

  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    res.status(400).json({ error: 'validation', message: 'At least 2 participant IDs are required' })
    return
  }

  if (participantIds.length > 100) {
    res.status(400).json({ error: 'validation', message: 'Cannot have more than 100 participants' })
    return
  }

  let parsedScheduledAt: Date | null = null
  if (scheduledAt) {
    const premium = await isUserPremium(userId)
    if (!premium) {
      res.status(403).json({
        error: 'premium_required',
        message: 'Vote scheduling requires a premium subscription',
        feature: 'vote-scheduling',
      })
      return
    }

    parsedScheduledAt = new Date(scheduledAt)
    if (isNaN(parsedScheduledAt.getTime())) {
      res.status(400).json({ error: 'validation', message: 'Invalid scheduledAt date format' })
      return
    }
    const minTime = Date.now() + 60 * 1000
    if (parsedScheduledAt.getTime() < minTime) {
      res.status(400).json({ error: 'validation', message: 'scheduledAt must be at least 1 minute in the future' })
      return
    }
    const maxTime = Date.now() + 7 * 24 * 60 * 60 * 1000
    if (parsedScheduledAt.getTime() > maxTime) {
      res.status(400).json({ error: 'validation', message: 'scheduledAt cannot be more than 7 days in the future' })
      return
    }
  }

  if (!participantIds.includes(userId)) {
    res.status(400).json({ error: 'validation', message: 'Session creator must be a participant' })
    return
  }

  try {
    const result = await createVotingSession({
      groupId,
      createdBy: userId,
      participantIds,
      filter,
      filters,
      scheduledAt: parsedScheduledAt,
    })

    res.status(201).json(result)
  } catch (error) {
    const err = error as Error & { statusCode?: number; errorCode?: string; invalidIds?: string[] }
    const status = err.statusCode || 500
    res.status(status).json({
      error: err.errorCode || 'internal',
      message: err.message,
      ...(err.invalidIds ? { invalidIds: err.invalidIds } : {}),
    })
  }
})

router.post('/:groupId/vote/:sessionId', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  const body = req.body as { steamAppId?: number; vote?: boolean; votes?: { steamAppId: number; vote: boolean }[] }

  let voteEntries: { steamAppId: number; vote: boolean }[]
  if (Array.isArray(body.votes)) {
    voteEntries = body.votes
  } else if (body.steamAppId !== undefined && body.vote !== undefined) {
    voteEntries = [{ steamAppId: body.steamAppId, vote: body.vote }]
  } else {
    res.status(400).json({ error: 'validation', message: 'votes array or steamAppId+vote are required' })
    return
  }

  if (voteEntries.length === 0) {
    res.status(400).json({ error: 'validation', message: 'At least one vote is required' })
    return
  }

  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'open' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No open session found' })
    return
  }

  const participantCount = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .count('* as count')
    .first()
  const hasParticipants = Number(participantCount?.count || 0) > 0

  if (hasParticipants) {
    const isParticipant = await db('voting_session_participants')
      .where({ session_id: sessionId, user_id: userId })
      .first()
    if (!isParticipant) {
      res.status(403).json({ error: 'forbidden', message: 'Not a participant in this voting session' })
      return
    }
  } else {
    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()
    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }
  }

  const sessionGames = await db('voting_session_games')
    .where({ session_id: sessionId })
    .whereIn('steam_app_id', voteEntries.map(v => v.steamAppId))
    .select('steam_app_id', 'game_id')

  const gameIdMap = new Map(sessionGames.map(g => [g.steam_app_id, g.game_id]))

  const invalidAppIds = voteEntries
    .map(v => v.steamAppId)
    .filter(id => !gameIdMap.has(id))
  if (invalidAppIds.length > 0) {
    res.status(400).json({
      error: 'validation',
      message: 'Some games are not part of this voting session',
      invalidAppIds,
    })
    return
  }

  const stillOpen = await db.transaction(async (trx) => {
    const locked = await trx('voting_sessions')
      .where({ id: sessionId, group_id: groupId, status: 'open' })
      .forShare()
      .first()
    if (!locked) return false

    for (const entry of voteEntries) {
      await trx('votes')
        .insert({
          session_id: sessionId,
          user_id: userId,
          steam_app_id: entry.steamAppId,
          game_id: gameIdMap.get(entry.steamAppId) || null,
          vote: entry.vote,
        })
        .onConflict(['session_id', 'user_id', 'steam_app_id'])
        .merge({ vote: entry.vote, created_at: trx.fn.now() })
    }
    return true
  })

  if (!stillOpen) {
    res.status(409).json({ error: 'conflict', message: 'Voting session was closed' })
    return
  }

  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  let totalParticipants: number
  if (hasParticipants) {
    const pCount = await db('voting_session_participants')
      .where({ session_id: sessionId })
      .count('* as count')
      .first()
    totalParticipants = Number(pCount?.count || 0)
  } else {
    const mCount = await db('group_members')
      .where({ group_id: groupId })
      .count('* as count')
      .first()
    totalParticipants = Number(mCount?.count || 0)
  }

  getIO().to(`group:${groupId}`).emit('vote:cast', {
    sessionId,
    userId,
    voterCount: Number(voterCount?.count || 0),
    totalParticipants,
  })

  domainEvents.emit('vote:cast', { sessionId, groupId, userId, source: 'web' })

  evaluateChallenges(userId, ['participation']).catch(err =>
    logger.warn({ error: String(err), userId }, 'challenge evaluation after vote failed')
  )

  res.json({ ok: true })
})

router.post('/:groupId/vote/:sessionId/close', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'open' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No open session found' })
    return
  }

  if (session.created_by !== userId && req.membership!.role !== 'owner') {
    res.status(403).json({ error: 'forbidden', message: 'Only session creator or group owner can close the vote' })
    return
  }

  const result = await closeSession(sessionId, groupId)

  if (!result) {
    res.status(409).json({ error: 'conflict', message: 'Session already closed' })
    return
  }

  res.json({ result })
})

router.post('/:groupId/vote/:sessionId/rematch', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'closed' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No closed session found' })
    return
  }

  const participantIds: string[] = await db('voting_session_participants')
    .join('group_members', function () {
      this.on('group_members.user_id', '=', 'voting_session_participants.user_id')
        .andOn('group_members.group_id', '=', db.raw('?', [groupId]))
    })
    .where('voting_session_participants.session_id', sessionId)
    .pluck('voting_session_participants.user_id')

  const finalParticipantIds = participantIds.length >= 2
    ? participantIds
    : await db('group_members').where({ group_id: groupId }).pluck('user_id')

  if (finalParticipantIds.length < 2) {
    res.status(400).json({ error: 'validation', message: 'At least 2 participants are required for a rematch' })
    return
  }

  if (!finalParticipantIds.includes(userId)) {
    finalParticipantIds.push(userId)
  }

  const excludeAppId = session.winning_game_app_id ? Number(session.winning_game_app_id) : null

  try {
    const result = await createVotingSession({
      groupId,
      createdBy: userId,
      participantIds: finalParticipantIds,
      excludeAppIds: excludeAppId ? [excludeAppId] : undefined,
    })

    res.status(201).json(result)
  } catch (error) {
    const err = error as Error & { statusCode?: number; errorCode?: string; invalidIds?: string[] }
    const status = err.statusCode || 500
    res.status(status).json({
      error: err.errorCode || 'internal',
      message: err.message,
      ...(err.invalidIds ? { invalidIds: err.invalidIds } : {}),
    })
  }
})

router.delete('/:groupId/vote/:sessionId', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'closed' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No closed session found' })
    return
  }

  if (session.created_by !== userId && req.membership!.role !== 'owner') {
    res.status(403).json({ error: 'forbidden', message: 'Only session creator or group owner can delete' })
    return
  }

  await db('voting_sessions').where({ id: sessionId }).del()

  res.json({ ok: true })
})

router.get('/:groupId/vote/history', requireGroupMembership({ paramName: 'groupId' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const premium = await isUserPremium(userId)
  const freeMax = FREE_TIER_LIMITS.maxVoteHistorySessions
  const { limit, offset } = applyTierLimits(
    Number(req.query['limit']) || 10,
    Number(req.query['offset']) || 0,
    premium,
    { freeMaxLimit: freeMax, premiumMaxLimit: PREMIUM_TIER_LIMITS.maxVoteHistorySessions }
  )

  const totalResult = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .count('id as count')
    .first()
  const total = Number(totalResult?.count ?? 0)

  const sessions = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .orderBy('closed_at', 'desc')
    .limit(limit)
    .offset(offset)
    .select('id', 'winning_game_app_id as winningGameAppId', 'winning_game_id as winningGameId', 'winning_game_name as winningGameName', 'closed_at as closedAt', 'created_by as createdBy')

  const freeLimitApplied = !premium && total > freeMax

  res.json({
    data: sessions,
    total,
    limit,
    offset,
    freeLimitApplied,
    freeLimit: freeMax,
  })
})

export { router as voteRoutes }
