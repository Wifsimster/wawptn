import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames } from '../../infrastructure/database/common-games.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { createVotingSession } from '../../domain/create-session.js'

const router = Router()

// ─── Bot-authenticated routes (called by the Discord bot) ─────────────────────

// Setup: Link a Discord channel to a WAWPTN group
router.post('/setup', async (req: Request, res: Response) => {
  const { groupId, discordChannelId, discordGuildId } = req.body as {
    groupId: string
    discordChannelId: string
    discordGuildId: string
  }

  if (!groupId || !discordChannelId || !discordGuildId) {
    res.status(400).json({ error: 'validation', message: 'groupId, discordChannelId, and discordGuildId are required' })
    return
  }

  const group = await db('groups').where({ id: groupId }).first()
  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Group not found' })
    return
  }

  await db('groups').where({ id: groupId }).update({
    discord_channel_id: discordChannelId,
    discord_guild_id: discordGuildId,
  })

  logger.info({ groupId, discordChannelId, discordGuildId }, 'Discord channel linked to group')

  res.json({ ok: true, groupName: group.name })
})

// Link status: Check if a Discord user is linked
router.get('/link/status', async (req: Request, res: Response) => {
  const discordUserId = req.headers['x-discord-user-id'] as string | undefined

  if (!discordUserId) {
    res.status(400).json({ error: 'validation', message: 'X-Discord-User-Id header required' })
    return
  }

  const link = await db('discord_links').where({ discord_id: discordUserId }).first()

  res.json({ linked: !!link, userId: link?.user_id })
})

// Generate link code: Create a temporary code for Discord account linking
router.post('/link', async (req: Request, res: Response) => {
  const { discordUserId, discordUsername } = req.body as {
    discordUserId: string
    discordUsername: string
  }

  if (!discordUserId || !discordUsername) {
    res.status(400).json({ error: 'validation', message: 'discordUserId and discordUsername are required' })
    return
  }

  // Check if already linked
  const existingLink = await db('discord_links').where({ discord_id: discordUserId }).first()
  if (existingLink) {
    res.status(409).json({ error: 'conflict', message: 'This Discord account is already linked' })
    return
  }

  // Delete any existing codes for this Discord user
  await db('discord_link_codes').where({ discord_id: discordUserId }).del()

  // Generate a short alphanumeric code
  const code = crypto.randomBytes(4).toString('hex').toUpperCase()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  await db('discord_link_codes').insert({
    code,
    discord_id: discordUserId,
    discord_username: discordUsername,
    expires_at: expiresAt,
  })

  res.json({ code, frontendUrl: env.CORS_ORIGIN })
})

// Vote via Discord: Cast a vote on behalf of a linked Discord user
router.post('/vote', async (req: Request, res: Response) => {
  const userId = req.userId

  if (!userId) {
    res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
    return
  }

  const { sessionId, steamAppId, vote } = req.body as {
    sessionId: string
    steamAppId: number
    vote: boolean
  }

  if (!sessionId || steamAppId === undefined || vote === undefined) {
    res.status(400).json({ error: 'validation', message: 'sessionId, steamAppId, and vote are required' })
    return
  }

  // Verify session is open
  const session = await db('voting_sessions')
    .where({ id: sessionId, status: 'open' })
    .first()

  if (!session) {
    res.status(404).json({ error: 'not_found', message: 'Aucune session de vote ouverte trouvée' })
    return
  }

  // Check if user is a participant
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
      res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas participant à cette session de vote' })
      return
    }
  } else {
    const membership = await db('group_members')
      .where({ group_id: session.group_id, user_id: userId })
      .first()
    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
      return
    }
  }

  // Look up game_id from session games
  const sessionGame = await db('voting_session_games')
    .where({ session_id: sessionId, steam_app_id: steamAppId })
    .first()

  // Upsert vote
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

  // Get voter count for progress
  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  let totalParticipants: number
  if (hasParticipants) {
    totalParticipants = Number(participantCount?.count || 0)
  } else {
    const mCount = await db('group_members')
      .where({ group_id: session.group_id })
      .count('* as count')
      .first()
    totalParticipants = Number(mCount?.count || 0)
  }

  // Notify via Socket.io (web UI stays in sync)
  getIO().to(`group:${session.group_id}`).emit('vote:cast', {
    sessionId,
    userId,
    voterCount: Number(voterCount?.count || 0),
    totalParticipants,
  })

  res.json({ ok: true })
})

// Get common games for a channel-linked group
router.get('/games', async (req: Request, res: Response) => {
  const channelId = req.query['channelId'] as string

  if (!channelId) {
    res.status(400).json({ error: 'validation', message: 'channelId query parameter required' })
    return
  }

  const group = await db('groups').where({ discord_channel_id: channelId }).first()
  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Aucun groupe lié à ce canal Discord' })
    return
  }

  const memberIds = await db('group_members').where({ group_id: group.id }).pluck('user_id')
  const games = await computeCommonGames(memberIds, { threshold: memberIds.length })

  res.json({
    groupName: group.name,
    games: games.map(g => ({
      gameName: g.gameName,
      steamAppId: g.steamAppId,
      ownerCount: g.ownerCount,
      totalMembers: memberIds.length,
    })),
  })
})

// Get groups for the linked Discord user
router.get('/groups', async (req: Request, res: Response) => {
  const userId = req.userId

  if (!userId) {
    res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
    return
  }

  const groups = await db('group_members')
    .join('groups', 'group_members.group_id', 'groups.id')
    .where({ 'group_members.user_id': userId })
    .select('groups.id', 'groups.name')

  res.json({ groups })
})

// Start a voting session from Discord
router.post('/vote/start', async (req: Request, res: Response) => {
  const userId = req.userId

  if (!userId) {
    res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
    return
  }

  const { groupId } = req.body as { groupId: string }

  if (!groupId) {
    res.status(400).json({ error: 'validation', message: 'groupId is required' })
    return
  }

  // Verify user is a member of this group
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
    return
  }

  // Get all group members as participants
  const memberIds = await db('group_members')
    .where({ group_id: groupId })
    .pluck('user_id')

  try {
    const result = await createVotingSession({
      groupId,
      createdBy: userId,
      participantIds: memberIds,
    })

    res.status(201).json(result)
  } catch (error) {
    const err = error as Error & { statusCode?: number; errorCode?: string }
    const status = err.statusCode || 500
    res.status(status).json({
      error: err.errorCode || 'internal',
      message: err.message,
    })
  }
})

// Pick a random common game for a group
router.get('/random', async (req: Request, res: Response) => {
  const userId = req.userId

  if (!userId) {
    res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
    return
  }

  const groupId = req.query['groupId'] as string

  if (!groupId) {
    res.status(400).json({ error: 'validation', message: 'groupId query parameter required' })
    return
  }

  // Verify user is a member
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
    return
  }

  const group = await db('groups').where({ id: groupId }).first()
  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Group not found' })
    return
  }

  const memberIds = await db('group_members')
    .where({ group_id: groupId })
    .pluck('user_id')

  const games = await computeCommonGames(memberIds, { threshold: memberIds.length })

  if (games.length === 0) {
    res.status(422).json({ error: 'no_common_games', message: 'Aucun jeu en commun trouvé pour ce groupe.' })
    return
  }

  const randomIndex = Math.floor(Math.random() * games.length)
  const game = games[randomIndex]!

  res.json({
    groupName: group.name,
    game: {
      gameName: game.gameName,
      steamAppId: game.steamAppId,
      headerImageUrl: game.headerImageUrl,
    },
  })
})

export { router as discordRoutes }

// ─── User-authenticated routes (called from web frontend) ─────────────────────

const userRouter = Router()

// Confirm Discord link: User enters code on web frontend to confirm the link
userRouter.post('/link/confirm', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const { code } = req.body as { code: string }

  if (!code) {
    res.status(400).json({ error: 'validation', message: 'code is required' })
    return
  }

  const linkCode = await db('discord_link_codes')
    .where({ code: code.toUpperCase() })
    .where('expires_at', '>', new Date())
    .first()

  if (!linkCode) {
    res.status(404).json({ error: 'not_found', message: 'Code invalide ou expiré' })
    return
  }

  // Check if this WAWPTN user is already linked to a Discord account
  const existingLink = await db('discord_links').where({ user_id: userId }).first()
  if (existingLink) {
    res.status(409).json({ error: 'conflict', message: 'Votre compte WAWPTN est déjà lié à un compte Discord' })
    return
  }

  // Create the permanent link
  await db('discord_links').insert({
    user_id: userId,
    discord_id: linkCode.discord_id,
    discord_username: linkCode.discord_username,
  })

  // Clean up the link code
  await db('discord_link_codes').where({ id: linkCode.id }).del()

  logger.info({ userId, discordId: linkCode.discord_id }, 'Discord account linked')

  res.json({ ok: true, discordUsername: linkCode.discord_username })
})

// Set webhook URL for a group (group owner only)
userRouter.post('/webhook', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const { groupId, webhookUrl } = req.body as { groupId: string; webhookUrl: string }

  if (!groupId || !webhookUrl) {
    res.status(400).json({ error: 'validation', message: 'groupId and webhookUrl are required' })
    return
  }

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only group owners can set the webhook URL' })
    return
  }

  await db('groups').where({ id: groupId }).update({ discord_webhook_url: webhookUrl })

  res.json({ ok: true })
})

export { userRouter as discordUserRoutes }
