import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// Get active voting session for a group
router.get('/:groupId/vote', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = req.params['groupId']!

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

  // Get votes for this session (only count, not content — no live tallies)
  const voterCount = await db('votes')
    .where({ session_id: session.id })
    .countDistinct('user_id as count')
    .first()

  const totalMembers = await db('group_members')
    .where({ group_id: groupId })
    .count('* as count')
    .first()

  // Get current user's votes
  const myVotes = await db('votes')
    .where({ session_id: session.id, user_id: userId })
    .select('steam_app_id as steamAppId', 'vote')

  // Get the games in this session
  const games = await db('voting_session_games')
    .where({ session_id: session.id })
    .select('steam_app_id as steamAppId', 'game_name as gameName', 'header_image_url as headerImageUrl')

  res.json({
    session: {
      id: session.id,
      groupId: session.group_id,
      status: session.status,
      createdBy: session.created_by,
      createdAt: session.created_at,
    },
    games,
    myVotes,
    voterCount: Number(voterCount?.count || 0),
    totalMembers: Number(totalMembers?.count || 0),
  })
})

// Create a new voting session (on-demand)
router.post('/:groupId/vote', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = req.params['groupId']!

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

  // Get common games
  const totalMembers = await db('group_members').where({ group_id: groupId }).count('* as count').first()
  const memberCount = Number(totalMembers?.count || 0)
  const group = await db('groups').where({ id: groupId }).first()
  const threshold = group?.common_game_threshold || memberCount

  const commonGames = await db('user_games')
    .whereIn('user_id', db('group_members').select('user_id').where({ group_id: groupId }))
    .groupBy('steam_app_id', 'game_name', 'header_image_url')
    .havingRaw('COUNT(DISTINCT user_id) >= ?', [threshold])
    .select('steam_app_id', 'game_name', 'header_image_url')

  if (commonGames.length === 0) {
    res.status(422).json({
      error: 'no_common_games',
      message: 'No common games found. Make sure all members have synced their Steam libraries and they are public.',
    })
    return
  }

  // Pick up to 20 random games for the session
  const shuffled = commonGames.sort(() => Math.random() - 0.5)
  const selectedGames = shuffled.slice(0, 20)

  // Create session
  const [session] = await db('voting_sessions').insert({
    group_id: groupId,
    status: 'open',
    created_by: userId,
  }).returning('*')

  // Insert session games
  await db('voting_session_games').insert(
    selectedGames.map(g => ({
      session_id: session.id,
      steam_app_id: g.steam_app_id,
      game_name: g.game_name,
      header_image_url: g.header_image_url,
    }))
  )

  // Notify group
  getIO().to(`group:${groupId}`).emit('session:created', {
    sessionId: session.id,
    groupId,
    createdBy: userId,
  })

  logger.info({ sessionId: session.id, groupId, gameCount: selectedGames.length }, 'voting session created')

  res.status(201).json({
    session: {
      id: session.id,
      groupId,
      status: 'open',
      createdBy: userId,
      createdAt: session.created_at,
    },
    games: selectedGames.map(g => ({
      steamAppId: g.steam_app_id,
      gameName: g.game_name,
      headerImageUrl: g.header_image_url,
    })),
  })
})

// Cast a vote (yes/no per game)
router.post('/:groupId/vote/:sessionId', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = req.params['groupId']!
  const sessionId = req.params['sessionId']!
  const { steamAppId, vote } = req.body as { steamAppId: number; vote: boolean }

  if (steamAppId === undefined || vote === undefined) {
    res.status(400).json({ error: 'validation', message: 'steamAppId and vote are required' })
    return
  }

  // Verify membership
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
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

  // Upsert vote (DB unique constraint prevents duplicates)
  await db('votes')
    .insert({
      session_id: sessionId,
      user_id: userId,
      steam_app_id: steamAppId,
      vote,
    })
    .onConflict(['session_id', 'user_id', 'steam_app_id'])
    .merge({ vote, created_at: db.fn.now() })

  // Get voter count
  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  // Notify group (just count, not content)
  getIO().to(`group:${groupId}`).emit('vote:cast', {
    sessionId,
    userId,
    voterCount: Number(voterCount?.count || 0),
  })

  res.json({ ok: true })
})

// Close voting session and compute winner
router.post('/:groupId/vote/:sessionId/close', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = req.params['groupId']!
  const sessionId = req.params['sessionId']!

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

  // Tally votes: count yes-votes per game
  const results = await db('votes')
    .where({ session_id: sessionId, vote: true })
    .groupBy('steam_app_id')
    .select('steam_app_id', db.raw('COUNT(*) as yes_count'))
    .orderBy('yes_count', 'desc')

  let winnerAppId: number | null = null
  let winnerName: string | null = null

  if (results.length > 0) {
    // Find max votes
    const maxVotes = Number(results[0]!.yes_count)
    const tied = results.filter(r => Number(r.yes_count) === maxVotes)

    // Random tie-break
    const winner = tied[Math.floor(Math.random() * tied.length)]!
    winnerAppId = winner.steam_app_id

    // Get game name
    const gameInfo = await db('voting_session_games')
      .where({ session_id: sessionId, steam_app_id: winnerAppId })
      .first()
    winnerName = gameInfo?.game_name || null
  }

  // Close session
  await db('voting_sessions').where({ id: sessionId }).update({
    status: 'closed',
    winning_game_app_id: winnerAppId,
    winning_game_name: winnerName,
    closed_at: db.fn.now(),
  })

  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  const result = {
    steamAppId: winnerAppId,
    gameName: winnerName,
    headerImageUrl: winnerAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${winnerAppId}/header.jpg` : null,
    yesCount: results.length > 0 ? Number(results[0]!.yes_count) : 0,
    totalVoters: Number(voterCount?.count || 0),
  }

  // Broadcast result
  getIO().to(`group:${groupId}`).emit('vote:closed', { sessionId, result })

  logger.info({ sessionId, groupId, winner: winnerName, winnerAppId }, 'voting session closed')

  res.json({ result })
})

// Get past voting sessions for a group
router.get('/:groupId/vote/history', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = req.params['groupId']!

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
    .select('id', 'winning_game_app_id as winningGameAppId', 'winning_game_name as winningGameName', 'closed_at as closedAt')

  res.json(sessions)
})

export { router as voteRoutes }
