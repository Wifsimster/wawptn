import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames } from '../../infrastructure/database/common-games.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { closeSession } from '../../domain/close-session.js'
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

  // Get the games in this session
  const games = await db('voting_session_games')
    .where({ session_id: session.id })
    .select('steam_app_id as steamAppId', 'game_id as gameId', 'game_name as gameName', 'header_image_url as headerImageUrl')

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

  // Check no open session exists
  const existingSession = await db('voting_sessions')
    .where({ group_id: groupId, status: 'open' })
    .first()

  if (existingSession) {
    res.status(409).json({ error: 'conflict', message: 'A voting session is already open' })
    return
  }

  const { filter, participantIds, scheduledAt } = req.body as { filter?: string; participantIds: string[]; scheduledAt?: string }

  // Validate participantIds
  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    res.status(400).json({ error: 'validation', message: 'At least 2 participant IDs are required' })
    return
  }

  // Validate scheduledAt if provided
  let parsedScheduledAt: Date | null = null
  if (scheduledAt) {
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

  // Validate all participant IDs are group members
  const validMembers = await db('group_members')
    .where({ group_id: groupId })
    .whereIn('user_id', participantIds)
    .pluck('user_id')

  const invalidIds = participantIds.filter(id => !validMembers.includes(id))
  if (invalidIds.length > 0) {
    res.status(422).json({ error: 'invalid_members', message: 'Some user IDs are not group members', invalidIds })
    return
  }

  // Get common games for the selected participants
  const group = await db('groups').where({ id: groupId }).first()
  const threshold = group?.common_game_threshold
    ? Math.min(group.common_game_threshold, validMembers.length)
    : validMembers.length

  const commonGames = await computeCommonGames(validMembers, { filter, threshold })

  if (commonGames.length === 0) {
    res.status(422).json({
      error: 'no_common_games',
      message: 'No common games found. Make sure all members have synced their Steam libraries and they are public.',
    })
    return
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
    created_by: userId,
    ...(parsedScheduledAt ? { scheduled_at: parsedScheduledAt } : {}),
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
    createdBy: userId,
    participantIds: validMembers,
    ...(parsedScheduledAt ? { scheduledAt: parsedScheduledAt.toISOString() } : {}),
  })

  logger.info({ sessionId: session.id, groupId, gameCount: selectedGames.length, participants: validMembers.length }, 'voting session created')

  res.status(201).json({
    session: {
      id: session.id,
      groupId,
      status: 'open',
      createdBy: userId,
      scheduledAt: session.scheduled_at || null,
      createdAt: session.created_at,
    },
    games: selectedGames.map(g => ({
      steamAppId: g.steamAppId,
      gameId: g.gameId || undefined,
      gameName: g.gameName,
      headerImageUrl: g.headerImageUrl,
    })),
  })
})

// Cast a vote (yes/no per game)
router.post('/:groupId/vote/:sessionId', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['groupId'])
  const sessionId = String(req.params['sessionId'])
  const { steamAppId, vote } = req.body as { steamAppId: number; vote: boolean }

  if (steamAppId === undefined || vote === undefined) {
    res.status(400).json({ error: 'validation', message: 'steamAppId and vote are required' })
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

  // Look up game_id from the session games
  const sessionGame = await db('voting_session_games')
    .where({ session_id: sessionId, steam_app_id: steamAppId })
    .first()

  // Upsert vote (DB unique constraint prevents duplicates)
  await db('votes')
    .insert({
      session_id: sessionId,
      user_id: userId,
      steam_app_id: steamAppId,
      game_id: sessionGame?.game_id || null,
      vote,
    })
    .onConflict(['session_id', 'user_id', 'steam_app_id'])
    .merge({ vote, created_at: db.fn.now() })

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

  const sessions = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .orderBy('closed_at', 'desc')
    .limit(10)
    .select('id', 'winning_game_app_id as winningGameAppId', 'winning_game_id as winningGameId', 'winning_game_name as winningGameName', 'closed_at as closedAt')

  res.json(sessions)
})

export { router as voteRoutes }
