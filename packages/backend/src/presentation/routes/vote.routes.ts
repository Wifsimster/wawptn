import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { closeSession } from '../../domain/close-session.js'
import { createVotingSession } from '../../domain/create-session.js'
import { isUserPremium } from '../middleware/tier.middleware.js'
import { evaluateChallenges } from '../../domain/challenges/challenge-service.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// Get active voting session for a group
router.get('/:groupId/vote', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    return
  }

  const session = await db('voting_sessions')
    .where({ group_id: groupId, status: 'open' })
    .orderBy('created_at', 'desc')
    .first()

  if (!session) {
    res.json({ session: null })
    return
  }

  // Get voter count
  const voterCount = await db('votes')
    .where({ session_id: session.id })
    .countDistinct('user_id as count')
    .first()

  // Set of user IDs that have already cast at least one vote in this
  // session. Used by the frontend to render per-participant progress on
  // the waiting screen without guessing from a bare count.
  const votedUserRows = await db('votes')
    .where({ session_id: session.id })
    .distinct('user_id')
    .pluck('user_id')

  // Get total participants from junction table, fallback to group_members for legacy sessions
  const participantCount = await db('voting_session_participants')
    .where({ session_id: session.id })
    .count('* as count')
    .first()
  const totalParticipants = Number(participantCount?.count || 0)

  let totalMembers: number
  if (totalParticipants > 0) {
    totalMembers = totalParticipants
  } else {
    // Fallback for sessions created before the junction table
    const memberCount = await db('group_members')
      .where({ group_id: groupId })
      .count('* as count')
      .first()
    totalMembers = Number(memberCount?.count || 0)
  }

  // Check if current user is a participant
  const isParticipant = totalParticipants === 0 || await db('voting_session_participants')
    .where({ session_id: session.id, user_id: userId })
    .first()

  // Get current user's votes
  const myVotes = await db('votes')
    .where({ session_id: session.id, user_id: userId })
    .select('steam_app_id as steamAppId', 'game_id as gameId', 'vote')

  // Get the games in this session, joined with metadata for detail view
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

  // Get participant IDs
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

// Create a new voting session (on-demand)
router.post('/:groupId/vote', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    return
  }

  const { filter, filters, participantIds, scheduledAt } = req.body as { filter?: string; filters?: { multiplayer?: boolean; coop?: boolean; free?: boolean }; participantIds: string[]; scheduledAt?: string }

  // Validate participantIds
  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    res.status(400).json({ error: 'validation', message: 'At least 2 participant IDs are required' })
    return
  }

  if (participantIds.length > 100) {
    res.status(400).json({ error: 'validation', message: 'Cannot have more than 100 participants' })
    return
  }

  // Validate scheduledAt if provided
  let parsedScheduledAt: Date | null = null
  if (scheduledAt) {
    // Vote scheduling is a premium feature
    const premium = await isUserPremium(userId)
    if (!premium) {
      res.status(403).json({ error: 'premium_required', message: 'Vote scheduling requires a premium subscription' })
      return
    }

    parsedScheduledAt = new Date(scheduledAt)
    if (isNaN(parsedScheduledAt.getTime())) {
      res.status(400).json({ error: 'validation', message: 'Invalid scheduledAt date format' })
      return
    }
    const minTime = Date.now() + 60 * 1000 // at least 1 minute in the future
    if (parsedScheduledAt.getTime() < minTime) {
      res.status(400).json({ error: 'validation', message: 'scheduledAt must be at least 1 minute in the future' })
      return
    }
    const maxTime = Date.now() + 7 * 24 * 60 * 60 * 1000 // max 7 days
    if (parsedScheduledAt.getTime() > maxTime) {
      res.status(400).json({ error: 'validation', message: 'scheduledAt cannot be more than 7 days in the future' })
      return
    }
  }

  // Ensure the session creator is included
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

// Cast votes (batch: all games in one request)
router.post('/:groupId/vote/:sessionId', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  // Support both single vote { steamAppId, vote } and batch { votes: [{ steamAppId, vote }] }
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

  // Verify session is open
  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'open' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No open session found' })
    return
  }

  // Check if user is a participant (junction table), fallback to group_members for legacy sessions
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
    // Legacy fallback: check group membership
    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()
    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }
  }

  // Look up game_ids from the session games
  const sessionGames = await db('voting_session_games')
    .where({ session_id: sessionId })
    .whereIn('steam_app_id', voteEntries.map(v => v.steamAppId))
    .select('steam_app_id', 'game_id')

  const gameIdMap = new Map(sessionGames.map(g => [g.steam_app_id, g.game_id]))

  // Reject votes for steam_app_ids that are not part of this session. Without
  // this check, a malicious client could insert vote rows for arbitrary
  // app ids, polluting the tally and bypassing session game filters.
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

  // Upsert all votes in a single transaction
  await db.transaction(async (trx) => {
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
  })

  // Get voter count
  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  // Get total participants for progress tracking
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

  // Notify group (include totalParticipants so waiting screen doesn't need to cache)
  getIO().to(`group:${groupId}`).emit('vote:cast', {
    sessionId,
    userId,
    voterCount: Number(voterCount?.count || 0),
    totalParticipants,
  })

  // Evaluate participation challenges (non-blocking)
  evaluateChallenges(userId, ['participation']).catch(err =>
    logger.warn({ error: String(err), userId }, 'challenge evaluation after vote failed')
  )

  res.json({ ok: true })
})

// Close voting session and compute winner
router.post('/:groupId/vote/:sessionId/close', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  // Only session creator or group owner can close
  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'open' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No open session found' })
    return
  }

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership || (session.created_by !== userId && membership.role !== 'owner')) {
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

// Rematch: create a new session with the same participants, excluding the winning game
router.post('/:groupId/vote/:sessionId/rematch', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])

  // Fetch the closed session
  const session = await db('voting_sessions')
    .where({ id: sessionId, group_id: groupId, status: 'closed' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'No closed session found' })
    return
  }

  // Check membership
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    return
  }

  // Fetch participants from the original session
  const participantIds: string[] = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .pluck('user_id')

  // Fallback to current group members if no participants recorded
  const finalParticipantIds = participantIds.length >= 2
    ? participantIds
    : await db('group_members').where({ group_id: groupId }).pluck('user_id')

  if (finalParticipantIds.length < 2) {
    res.status(400).json({ error: 'validation', message: 'At least 2 participants are required for a rematch' })
    return
  }

  // Ensure the requesting user is a participant
  if (!finalParticipantIds.includes(userId)) {
    finalParticipantIds.push(userId)
  }

  // Build exclude filter for the winning game
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

// Delete a closed voting session (creator or group owner only)
router.delete('/:groupId/vote/:sessionId', async (req: Request, res: Response) => {
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

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership || (session.created_by !== userId && membership.role !== 'owner')) {
    res.status(403).json({ error: 'forbidden', message: 'Only session creator or group owner can delete' })
    return
  }

  await db('voting_sessions').where({ id: sessionId }).del()

  res.json({ ok: true })
})

// Get past voting sessions for a group
router.get('/:groupId/vote/history', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    return
  }

  const limit = Math.min(Math.max(Number(req.query['limit']) || 10, 1), 50)
  const offset = Math.max(Number(req.query['offset']) || 0, 0)

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

  res.json({ data: sessions, total, limit, offset })
})

export { router as voteRoutes }
