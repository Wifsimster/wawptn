import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames } from '../../infrastructure/database/common-games.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { createVotingSession } from '../../domain/create-session.js'
import { isLLMEnabled, generateChatResponse, type ChatContext } from '../../infrastructure/llm/client.js'

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

// ─── Conversational chat (LLM-powered) ──────────────────────────────────────

// In-memory rate limiter: 5 requests per 5 minutes per user
const chatRateLimits = new Map<string, { count: number; resetAt: number }>()
const CHAT_RATE_LIMIT = 5
const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000

router.post('/chat', async (req: Request, res: Response) => {
  if (!isLLMEnabled()) {
    res.status(501).json({ error: 'not_configured', message: 'Conversational mode is not enabled (LLM_API_KEY not set)' })
    return
  }

  const discordUserId = req.headers['x-discord-user-id'] as string | undefined
  const { channelId, message } = req.body as {
    channelId?: string
    message?: string
  }

  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: 'validation', message: 'message is required' })
    return
  }

  // Rate limiting
  if (discordUserId) {
    const now = Date.now()
    const userLimit = chatRateLimits.get(discordUserId)

    if (userLimit && now < userLimit.resetAt) {
      if (userLimit.count >= CHAT_RATE_LIMIT) {
        res.status(429).json({ error: 'rate_limited', message: 'Doucement ! Tu me poses trop de questions. Réessaie dans quelques minutes.' })
        return
      }
      userLimit.count++
    } else {
      chatRateLimits.set(discordUserId, { count: 1, resetAt: now + CHAT_RATE_WINDOW_MS })
    }
  }

  // Build context from the channel-linked group
  const context: ChatContext = {}

  // Resolve user name
  if (req.userId) {
    const user = await db('users').where({ id: req.userId }).first()
    if (user) {
      context.userName = user.display_name || user.steam_persona_name
    }
  }

  // Resolve group from channel
  if (channelId) {
    const group = await db('groups').where({ discord_channel_id: channelId }).first()

    if (group) {
      context.groupName = group.name

      const memberIds = await db('group_members').where({ group_id: group.id }).pluck('user_id')
      context.memberCount = memberIds.length

      if (memberIds.length > 0) {
        const games = await computeCommonGames(memberIds, { threshold: memberIds.length })
        context.commonGamesCount = games.length
        context.commonGames = games.slice(0, 20).map(g => ({ name: g.gameName, steamAppId: g.steamAppId }))
      }

      // Recent vote sessions (last 3)
      const recentSessions = await db('voting_sessions')
        .where({ group_id: group.id })
        .orderBy('created_at', 'desc')
        .limit(3)
        .select('id', 'status', 'created_at')

      if (recentSessions.length > 0) {
        const sessions: Array<{ date: string; winner?: string }> = []
        for (const session of recentSessions) {
          const topVote = await db('votes')
            .where({ session_id: session.id, vote: true })
            .groupBy('steam_app_id')
            .count('* as vote_count')
            .orderBy('vote_count', 'desc')
            .first()

          let winner: string | undefined
          if (topVote) {
            const game = await db('user_games')
              .where({ steam_app_id: topVote.steam_app_id })
              .first()
            winner = game?.game_name
          }

          sessions.push({
            date: new Date(session.created_at).toLocaleDateString('fr-FR'),
            winner,
          })
        }
        context.recentVoteSessions = sessions
      }
    }
  }

  try {
    const reply = await generateChatResponse(message.slice(0, 1000), context)

    // Sanitize: strip @everyone, @here, and role mentions
    const sanitized = reply
      .replace(/@everyone/g, '@\u200Beveryone')
      .replace(/@here/g, '@\u200Bhere')

    res.json({ reply: sanitized })
  } catch (error) {
    res.status(503).json({
      error: 'llm_error',
      message: error instanceof Error ? error.message : 'Erreur lors de la génération de la réponse',
    })
  }
})

export { router as discordRoutes }

// ─── Bot-only utility routes ──────────────────────────────────────────────────

// Get all Discord channels linked to a group (for scheduled messages)
router.get('/linked-channels', async (_req: Request, res: Response) => {
  const channels = await db('groups')
    .whereNotNull('discord_channel_id')
    .select('discord_channel_id as channelId', 'name as groupName')

  res.json(channels)
})

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
