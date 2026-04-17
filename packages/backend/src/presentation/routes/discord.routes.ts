import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames } from '../../infrastructure/database/common-games.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { logger, authLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { requireBotAuth } from '../middleware/bot-auth.middleware.js'
import { isUserPremium } from '../middleware/tier.middleware.js'
import { createVotingSession } from '../../domain/create-session.js'
import { domainEvents } from '../../domain/events/event-bus.js'
import { isLLMEnabled, generateChatResponse, type ChatContext } from '../../infrastructure/llm/client.js'
import { createDiscordAuthIntent } from '../../domain/discord-auth-intent.js'

/** Check if a group's owner has premium. Returns false if no owner found. */
async function isGroupOwnerPremium(groupId: string): Promise<boolean> {
  const owner = await db('group_members').where({ group_id: groupId, role: 'owner' }).select('user_id').first()
  if (!owner) return false
  return isUserPremium(owner.user_id)
}

const router = Router()

// ─── Bot-authenticated routes (called by the Discord bot) ─────────────────────

// Setup: Link a Discord channel to a WAWPTN group.
//
// Discord channel binding is now part of the base product (design meeting
// decision C4 — 2026-04-14). The previous premium gate has been removed;
// every user can bind a channel to their group.
router.post('/setup', async (req: Request, res: Response) => {
  const { groupId, discordChannelId, discordGuildId, discordGuildName, discordChannelName } = req.body as {
    groupId: string
    discordChannelId: string
    discordGuildId: string
    discordGuildName?: string | null
    discordChannelName?: string | null
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

  // Names are snapshotted at setup time so the UI can show a readable
  // "linked to #channel on Server" chip without a live Discord API call.
  // The bot sends them from the interaction context; tolerate missing
  // values by falling back to null (frontend shows a generic label).
  const guildName = typeof discordGuildName === 'string' && discordGuildName.trim() ? discordGuildName.trim().slice(0, 200) : null
  const channelName = typeof discordChannelName === 'string' && discordChannelName.trim() ? discordChannelName.trim().slice(0, 200) : null

  await db('groups').where({ id: groupId }).update({
    discord_channel_id: discordChannelId,
    discord_guild_id: discordGuildId,
    discord_guild_name: guildName,
    discord_channel_name: channelName,
  })

  logger.info({ groupId, discordChannelId, discordGuildId, discordGuildName: guildName, discordChannelName: channelName }, 'Discord channel linked to group')

  res.json({ ok: true, groupName: group.name })
})

/**
 * Magic-link intent issuance (bot-auth).
 *
 * Called by the Discord bot when a user runs `/wawptn setup` (or any
 * slash command that needs a linked WAWPTN session). The bot passes
 * the Discord identity and the target channel/guild; the backend mints
 * a one-shot nonce and returns the URL the bot should surface in its
 * ephemeral reply.
 *
 * The URL is an absolute API endpoint — the browser hits it directly,
 * and the backend bounces the user through Steam OpenID before
 * materialising their `group_members` row.
 */
router.post('/intent', async (req: Request, res: Response) => {
  const { discordUserId, discordUsername, discordChannelId, discordGuildId, channelName } = req.body as {
    discordUserId?: string
    discordUsername?: string
    discordChannelId?: string
    discordGuildId?: string
    channelName?: string | null
  }

  if (!discordUserId || !discordUsername || !discordChannelId || !discordGuildId) {
    res.status(400).json({
      error: 'validation',
      message: 'discordUserId, discordUsername, discordChannelId, and discordGuildId are required',
    })
    return
  }

  try {
    const { nonce, expiresAt } = await createDiscordAuthIntent({
      discordId: discordUserId,
      discordUsername,
      discordChannelId,
      discordGuildId,
      channelName: channelName ?? null,
    })

    const url = `${env.API_URL}/api/auth/discord/intent/${nonce}`
    res.json({ nonce, url, expiresAt })
  } catch (error) {
    authLogger.error({ error: String(error), discordUserId }, 'failed to create discord auth intent')
    res.status(500).json({ error: 'internal', message: 'Failed to create auth intent' })
  }
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

  // Emit a domain event so the Discord live-count updater re-renders the
  // interactive message with fresh tallies. `source: 'discord'` helps
  // downstream logging tell web-cast and bot-cast votes apart.
  domainEvents.emit('vote:cast', {
    sessionId,
    groupId: session.group_id,
    userId,
    source: 'discord',
  })

  res.json({ ok: true })
})

// Get common games — resolved either by a channel link or an explicit groupId
router.get('/games', async (req: Request, res: Response) => {
  const channelId = req.query['channelId'] as string | undefined
  const groupId = req.query['groupId'] as string | undefined

  if (!channelId && !groupId) {
    res.status(400).json({ error: 'validation', message: 'channelId or groupId query parameter required' })
    return
  }

  let group
  if (groupId) {
    // When querying by groupId, the caller must be a linked Discord user
    // and a member of the group.
    const userId = req.userId
    if (!userId) {
      res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
      return
    }

    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
      return
    }

    group = await db('groups').where({ id: groupId }).first()
    if (!group) {
      res.status(404).json({ error: 'not_found', message: 'Group not found' })
      return
    }
  } else {
    group = await db('groups').where({ discord_channel_id: channelId }).first()
    if (!group) {
      res.status(404).json({ error: 'not_found', message: 'Aucun groupe lié à ce canal Discord' })
      return
    }
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

  // Bidirectional voting (start a vote from Discord, see it on the web,
  // vote from either side) is part of the free tier — it's the core
  // promise of the product per the C4 design decision (2026-04-14).
  // Other Discord bot features (daily challenges, LLM chat) keep their
  // own premium gates lower in this file.

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
    // The Discord bot surfaces `message` verbatim to end users; the app
    // UI is in French so translate the well-known domain errors here.
    // Anything unrecognised falls through to the original message.
    const message =
      err.errorCode === 'conflict'
        ? 'Un vote est déjà en cours dans ce groupe. Terminez-le avant d\'en démarrer un autre.'
        : err.errorCode === 'no_common_games'
          ? 'Aucun jeu en commun trouvé pour ce groupe. Assurez-vous que les bibliothèques Steam sont synchronisées et publiques.'
          : err.message
    res.status(status).json({
      error: err.errorCode || 'internal',
      message,
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

// ─── Daily challenge (Discord) ──────────────────────────────────────────────

// Create (or fetch existing) daily challenge for the group linked to a channel
router.post('/daily-challenge/create', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
      return
    }

    const { channelId, guildId } = req.body as { channelId?: string; guildId?: string }
    if (!channelId || !guildId) {
      res.status(400).json({ error: 'validation', message: 'channelId and guildId are required' })
      return
    }

    // Resolve the group via channel link
    const group = await db('groups').where({ discord_channel_id: channelId }).first()
    if (!group) {
      res.status(404).json({ error: 'not_found', message: 'Aucun groupe lié à ce canal Discord' })
      return
    }

    // Daily challenges are part of the free "groupe vivant" baseline —
    // the goal is to keep linked channels active without asking users
    // to upgrade first. Premium still covers features with real cost
    // or broadcast scope (LLM chat, announcement multi-webhooks,
    // auto-vote cron, scheduled votes).

    // Compute today's date in Europe/Paris timezone
    const todayRow = await db.raw(`SELECT (now() AT TIME ZONE 'Europe/Paris')::date AS today`)
    const today = todayRow.rows[0].today as string

    // Idempotent: if a challenge exists for today, return it unchanged
    const existing = await db('discord_daily_challenges')
      .where({ group_id: group.id, challenge_date: today })
      .first()

    if (existing) {
      res.json({
        challenge: {
          id: existing.id,
          steamAppId: existing.steam_app_id,
          gameId: existing.game_id,
          gameName: existing.game_name,
          headerImageUrl: existing.header_image_url,
          alreadyExists: true,
        },
      })
      return
    }

    // Pick a random common game from the group members' libraries
    const memberIds = await db('group_members').where({ group_id: group.id }).pluck('user_id')
    const games = await computeCommonGames(memberIds, { threshold: memberIds.length })

    if (games.length === 0) {
      res.status(422).json({ error: 'no_common_games', message: 'Aucun jeu en commun trouvé pour ce groupe.' })
      return
    }

    const randomIndex = Math.floor(Math.random() * games.length)
    const game = games[randomIndex]!

    const [inserted] = await db('discord_daily_challenges')
      .insert({
        group_id: group.id,
        challenge_date: today,
        steam_app_id: game.steamAppId,
        game_id: game.gameId,
        game_name: game.gameName,
        header_image_url: game.headerImageUrl,
        discord_channel_id: channelId,
        created_by_user_id: userId,
      })
      .returning('*')

    logger.info({ groupId: group.id, challengeId: inserted.id, date: today }, 'Daily challenge created')

    res.json({
      challenge: {
        id: inserted.id,
        steamAppId: inserted.steam_app_id,
        gameId: inserted.game_id,
        gameName: inserted.game_name,
        headerImageUrl: inserted.header_image_url,
        alreadyExists: false,
      },
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'daily-challenge create failed')
    res.status(500).json({ error: 'internal', message: 'Erreur lors de la création du défi du jour' })
  }
})

// Claim today's challenge (user has played/accepted)
router.post('/daily-challenge/claim', async (req: Request, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(403).json({ error: 'forbidden', message: 'Discord account not linked. Use /wawptn-link first.' })
      return
    }

    const { challengeId } = req.body as { challengeId?: string }
    if (!challengeId) {
      res.status(400).json({ error: 'validation', message: 'challengeId is required' })
      return
    }

    const challenge = await db('discord_daily_challenges').where({ id: challengeId }).first()
    if (!challenge) {
      res.status(404).json({ error: 'not_found', message: 'Défi introuvable' })
      return
    }

    // Insert claim (idempotent via onConflict ignore)
    await db('discord_daily_challenge_claims')
      .insert({
        challenge_id: challengeId,
        user_id: userId,
      })
      .onConflict(['challenge_id', 'user_id'])
      .ignore()

    // Fetch this user's claim record to determine rank
    const userClaim = await db('discord_daily_challenge_claims')
      .where({ challenge_id: challengeId, user_id: userId })
      .first()

    // Rank = number of claims on this challenge with claimed_at <= userClaim.claimed_at
    const rankRow = await db('discord_daily_challenge_claims')
      .where({ challenge_id: challengeId })
      .andWhere('claimed_at', '<=', userClaim.claimed_at)
      .count<{ count: string }[]>('* as count')
      .first()

    const totalRow = await db('discord_daily_challenge_claims')
      .where({ challenge_id: challengeId })
      .count<{ count: string }[]>('* as count')
      .first()

    const rank = Number(rankRow?.count ?? 0)
    const totalClaims = Number(totalRow?.count ?? 0)

    res.json({
      rank,
      totalClaims,
      firstClaimer: rank === 1,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'daily-challenge claim failed')
    res.status(500).json({ error: 'internal', message: 'Erreur lors de la validation du défi' })
  }
})

// Store the Discord message ID tied to a daily challenge
router.patch('/daily-challenge/:id/message', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { messageId } = req.body as { messageId?: string }

    if (!messageId) {
      res.status(400).json({ error: 'validation', message: 'messageId is required' })
      return
    }

    const updated = await db('discord_daily_challenges')
      .where({ id })
      .update({ discord_message_id: messageId })

    if (updated === 0) {
      res.status(404).json({ error: 'not_found', message: 'Défi introuvable' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'daily-challenge message update failed')
    res.status(500).json({ error: 'internal', message: 'Erreur lors de la mise à jour du message' })
  }
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
  const { channelId, message, personaVoice } = req.body as {
    channelId?: string
    message?: string
    personaVoice?: string
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
  const context: ChatContext = { personaVoice }

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
      // LLM chat via Discord requires group owner premium
      const ownerPremium = await isGroupOwnerPremium(group.id)
      if (!ownerPremium) {
        res.status(403).json({ error: 'premium_required', message: 'Discord bot chat requires a premium subscription' })
        return
      }

      context.groupName = group.name

      const memberIds = await db('group_members').where({ group_id: group.id }).pluck('user_id')
      context.memberCount = memberIds.length

      if (memberIds.length > 0) {
        const games = await computeCommonGames(memberIds, { threshold: memberIds.length })
        context.commonGamesCount = games.length
        context.commonGames = games.slice(0, 20).map(g => g.gameName)
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

// Get all active personas (for bot persona rotation)
router.get('/personas', async (_req: Request, res: Response) => {
  const personas = await db('personas')
    .where({ is_active: true })
    .select('*')
    .orderBy('created_at', 'asc')

  res.json(personas.map(p => ({
    id: p.id,
    name: p.name,
    systemPromptOverlay: p.system_prompt_overlay,
    fridayMessages: p.friday_messages,
    weekdayMessages: p.weekday_messages,
    backOnlineMessages: p.back_online_messages,
    emptyMentionReply: p.empty_mention_reply,
    introMessage: p.intro_message,
    embedColor: p.embed_color,
  })))
})

// Get bot settings from app_settings table (for scheduler config)
router.get('/bot-settings', async (_req: Request, res: Response) => {
  const rows = await db('app_settings')
    .where('key', 'like', 'bot.%')
    .select('key', 'value')

  // app_settings.value is a jsonb column but the seed migration and the
  // admin PATCH endpoint both call JSON.stringify() before inserting, so
  // the exact shape that comes back from knex/pg depends on how the row
  // was written. Defensively unwrap string values so the Discord bot's
  // scheduler receives a plain cron expression like `0 21 * * 5` instead
  // of the JSON-encoded `"0 21 * * 5"` with literal quotes — the latter
  // fails cron.validate() silently and no reminder ever gets scheduled.
  // This mirrors the parse helper in loadGlobalBotDefaults() below.
  const settings: Record<string, unknown> = {}
  for (const row of rows) {
    const shortKey = row.key.replace(/^bot\./, '')
    let value: unknown = row.value
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        // Not JSON — leave as-is (plain string, already usable).
      }
    }
    settings[shortKey] = value
  }

  res.json(settings)
})

// Get all Discord channels linked to a group (for scheduled messages).
// Each entry now carries `groupId` + per-group persona settings so the bot
// can compute the correct "persona du jour" per channel: one persona pick
// per group, not one globally shared persona for every linked server.
router.get('/linked-channels', async (_req: Request, res: Response) => {
  const channels = await db('groups')
    .leftJoin('group_persona_settings', 'group_persona_settings.group_id', 'groups.id')
    .whereNotNull('groups.discord_channel_id')
    .select(
      'groups.id as groupId',
      'groups.discord_channel_id as channelId',
      'groups.discord_guild_id as guildId',
      'groups.name as groupName',
      'group_persona_settings.rotation_enabled as rotationEnabled',
      'group_persona_settings.disabled_personas as disabledPersonas',
      'group_persona_settings.persona_override as personaOverride',
      'group_persona_settings.override_expires_at as overrideExpiresAt',
    )

  res.json(
    channels.map((c: {
      groupId: string
      channelId: string
      guildId: string | null
      groupName: string
      rotationEnabled: boolean | null
      disabledPersonas: string[] | null
      personaOverride: string | null
      overrideExpiresAt: Date | string | null
    }) => ({
      groupId: c.groupId,
      channelId: c.channelId,
      guildId: c.guildId,
      groupName: c.groupName,
      personaSettings: {
        rotationEnabled: c.rotationEnabled,
        disabledPersonas: c.disabledPersonas ?? [],
        personaOverride: c.personaOverride,
        overrideExpiresAt: c.overrideExpiresAt
          ? new Date(c.overrideExpiresAt).toISOString()
          : null,
      },
    })),
  )
})

// ─── Per-guild bot config overrides (Tom #2) ──────────────────────────────
// The Discord bot /wawptn-config slash command reads and writes these via
// the two endpoints below. Settings are merged against the global defaults
// in app_settings on read so the bot only ever sees a fully-resolved
// BotSettings-shaped payload.

interface GlobalBotDefaults {
  friday_schedule: string
  wednesday_schedule: string
  schedule_timezone: string
}

async function loadGlobalBotDefaults(): Promise<GlobalBotDefaults> {
  const rows = await db('app_settings')
    .whereIn('key', ['bot.friday_schedule', 'bot.wednesday_schedule', 'bot.schedule_timezone'])
    .select('key', 'value')

  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const parse = (key: string, fallback: string): string => {
    const raw = byKey.get(key)
    if (typeof raw !== 'string' || raw.length === 0) return fallback
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'string' ? parsed : fallback
    } catch {
      return raw
    }
  }
  return {
    friday_schedule: parse('bot.friday_schedule', '0 21 * * 5'),
    wednesday_schedule: parse('bot.wednesday_schedule', '0 17 * * 3'),
    schedule_timezone: parse('bot.schedule_timezone', 'Europe/Paris'),
  }
}

// Bot auth is enforced here (and on the PUT below) in addition to the
// mount-level `requireBotAuth` in index.ts. Defense-in-depth: (1) makes the
// auth contract visible when reading the route in isolation — the reviewer
// who flagged this file (no access control!) was right to be worried — and
// (2) keeps the route safe if the index.ts mount-order ever regresses or
// `DISCORD_BOT_API_SECRET` falls out of the env and the routes collide with
// the unauthed `discordUserRoutes` mount.
router.get('/guild-settings/:guildId', requireBotAuth, async (req: Request, res: Response) => {
  const guildId = String(req.params['guildId'] ?? '')
  if (!/^\d{5,32}$/.test(guildId)) {
    res.status(400).json({ error: 'validation', message: 'guildId must be a Discord snowflake' })
    return
  }

  const defaults = await loadGlobalBotDefaults()
  const override = await db('discord_guild_settings').where({ guild_id: guildId }).first()

  res.json({
    guildId,
    friday_schedule: override?.friday_schedule ?? defaults.friday_schedule,
    wednesday_schedule: override?.wednesday_schedule ?? defaults.wednesday_schedule,
    schedule_timezone: override?.schedule_timezone ?? defaults.schedule_timezone,
    // Flags whose fields are overridden so the UI can show "(default)"
    // labels next to inherited values.
    overrides: {
      friday_schedule: override?.friday_schedule != null,
      wednesday_schedule: override?.wednesday_schedule != null,
      schedule_timezone: override?.schedule_timezone != null,
    },
    updatedAt: override?.updated_at ?? null,
  })
})

router.put('/guild-settings/:guildId', requireBotAuth, async (req: Request, res: Response) => {
  const guildId = String(req.params['guildId'] ?? '')
  if (!/^\d{5,32}$/.test(guildId)) {
    res.status(400).json({ error: 'validation', message: 'guildId must be a Discord snowflake' })
    return
  }

  const body = req.body as {
    friday_schedule?: string | null
    wednesday_schedule?: string | null
    schedule_timezone?: string | null
    updatedByDiscordId?: string | null
  }

  // Each field accepts either a valid cron string (or tz string) or
  // explicit null to drop the override back to the global default.
  // Undefined = "don't touch this column" (partial PATCH semantics even
  // though the verb is PUT — the bot command always sends one field at
  // a time).
  const cronPattern = /^[-*/,0-9\s]+$/
  if (body.friday_schedule !== undefined && body.friday_schedule !== null) {
    if (typeof body.friday_schedule !== 'string' || body.friday_schedule.length > 64 || !cronPattern.test(body.friday_schedule)) {
      res.status(400).json({ error: 'validation', message: 'friday_schedule must be a valid cron string' })
      return
    }
  }
  if (body.wednesday_schedule !== undefined && body.wednesday_schedule !== null) {
    if (typeof body.wednesday_schedule !== 'string' || body.wednesday_schedule.length > 64 || !cronPattern.test(body.wednesday_schedule)) {
      res.status(400).json({ error: 'validation', message: 'wednesday_schedule must be a valid cron string' })
      return
    }
  }
  if (body.schedule_timezone !== undefined && body.schedule_timezone !== null) {
    if (typeof body.schedule_timezone !== 'string' || body.schedule_timezone.length > 64) {
      res.status(400).json({ error: 'validation', message: 'schedule_timezone must be a valid IANA timezone string' })
      return
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: db.fn.now(),
    updated_by_discord_id: body.updatedByDiscordId ?? null,
  }
  if (body.friday_schedule !== undefined) updates.friday_schedule = body.friday_schedule
  if (body.wednesday_schedule !== undefined) updates.wednesday_schedule = body.wednesday_schedule
  if (body.schedule_timezone !== undefined) updates.schedule_timezone = body.schedule_timezone

  await db('discord_guild_settings')
    .insert({ guild_id: guildId, ...updates })
    .onConflict('guild_id')
    .merge()

  res.json({ ok: true })
})

// Group leaderboard: aggregates voting activity into three rankings so the
// Discord bot can surface "who's the most active in this group". Used by the
// /wawptn-stats slash command.
router.get('/stats', async (req: Request, res: Response) => {
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

  // Verify the requesting user is a member of the group — leaderboards are
  // group-private and should never leak across groups.
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()
  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
    return
  }

  const group = await db('groups').where({ id: groupId }).first()
  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Groupe introuvable' })
    return
  }

  // ── Top vote launchers — who created the most voting sessions ──────────
  // Limited to closed sessions so cancelled or stale draft sessions don't
  // skew the count.
  const launchers = await db('voting_sessions')
    .join('users', 'voting_sessions.created_by', 'users.id')
    .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
    .groupBy('users.id', 'users.display_name')
    .select(
      'users.id as userId',
      'users.display_name as displayName',
      db.raw('COUNT(voting_sessions.id)::int as count'),
    )
    .orderBy('count', 'desc')
    .limit(5)

  // ── Most active voters — distinct sessions each member has cast a vote in ──
  const voters = await db('votes')
    .join('voting_sessions', 'votes.session_id', 'voting_sessions.id')
    .join('users', 'votes.user_id', 'users.id')
    .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
    .groupBy('users.id', 'users.display_name')
    .select(
      'users.id as userId',
      'users.display_name as displayName',
      db.raw('COUNT(DISTINCT votes.session_id)::int as count'),
    )
    .orderBy('count', 'desc')
    .limit(5)

  // ── Top winning games — count of times each game won a session ─────────
  const topGames = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .whereNotNull('winning_game_app_id')
    .groupBy('winning_game_app_id', 'winning_game_name')
    .select(
      'winning_game_app_id as steamAppId',
      'winning_game_name as gameName',
      db.raw('COUNT(*)::int as wins'),
    )
    .orderBy('wins', 'desc')
    .limit(5)

  // ── Streak leaders — best consecutive participation streak in this group ──
  const streakLeaders = await db('streaks')
    .join('users', 'streaks.user_id', 'users.id')
    .where({ 'streaks.group_id': groupId })
    .where('streaks.best_streak', '>', 0)
    .orderBy('streaks.best_streak', 'desc')
    .orderBy('streaks.current_streak', 'desc')
    .limit(5)
    .select(
      'users.id as userId',
      'users.display_name as displayName',
      'streaks.current_streak as currentStreak',
      'streaks.best_streak as bestStreak',
    )

  const totalSessionsRow = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .count('id as count')
    .first()

  res.json({
    groupId,
    groupName: group.name,
    totalSessions: Number(totalSessionsRow?.count ?? 0),
    launchers,
    voters,
    topGames,
    streakLeaders,
  })
})

// ─── User-authenticated routes (called from web frontend) ─────────────────────

const userRouter = Router()

// Bot invite URL: surfaced in the "link a Discord channel" UI so the group
// owner can add the WAWPTN bot to their server, then finish binding with
// `/wawptn-setup` in the target channel. Public (no auth) — the URL carries
// no secret, and the frontend needs to know whether to show the button
// before the owner has clicked on anything.
userRouter.get('/bot-invite-url', async (_req: Request, res: Response) => {
  const { isBotConfigured, buildBotInviteUrl } = await import('../../infrastructure/discord/bot-invite.js')
  if (!isBotConfigured()) {
    res.json({ enabled: false, url: null })
    return
  }
  res.json({ enabled: true, url: buildBotInviteUrl() })
})

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

// Unlink Discord: Remove the linked Discord account for the current user.
// Safe to call even if the user isn't linked (idempotent) so the frontend
// doesn't have to special-case the empty state.
userRouter.delete('/link', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const deleted = await db('discord_links').where({ user_id: userId }).del()
  logger.info({ userId, deleted }, 'Discord account unlinked')
  res.json({ ok: true, wasLinked: deleted > 0 })
})

// Set webhook URL for a group (group owner only).
//
// Binding a Discord destination to a group is part of the free tier
// (C4 design decision — 2026-04-14). Both binding paths must be free
// for the promise to hold: `/setup` for users who deploy the bot in
// their guild, and this `/webhook` endpoint for users who only want
// one-way announcements without running a bot. Keeping only one of
// them free would leave webhook-only adopters behind the paywall.
//
// Announcement webhooks (multi-channel broadcast) stay premium — see
// `/announcements` below.
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

// ─── Extra announcement webhooks (Tom #4) ─────────────────────────────────
// Lets a group owner broadcast vote results to additional channels beyond
// the primary discord_webhook_url — typically #general or #announcements in
// the same guild for cross-channel visibility. The primary webhook stays
// where it is; these are additive.
//
// These endpoints stay PREMIUM explicitly, by arbitration (2026-04-15, #143).
// When the C4 "Salon = Groupe" decision made the primary binding free
// (`/setup` and `/webhook` above), the premium line was redrawn to cover
// only features with (a) real runtime cost, or (b) broadcast scope beyond
// the single bound channel. Announcement webhooks are case (b): one POST
// here fans out to up to ANNOUNCEMENT_WEBHOOK_LIMIT channels, so they are
// explicitly premium and not part of the base binding promise.
//
// Related explicitly-premium endpoints in this file: `/chat` (LLM cost).

const ANNOUNCEMENT_WEBHOOK_LIMIT = 5

async function assertOwnerAndPremium(
  userId: string,
  groupId: string,
  res: Response,
): Promise<boolean> {
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()
  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only group owners can manage announcement channels' })
    return false
  }
  const premium = await isUserPremium(userId)
  if (!premium) {
    res.status(403).json({ error: 'premium_required', message: 'Announcement channels require a premium subscription' })
    return false
  }
  return true
}

// List announcement webhooks for a group. The webhook URL itself is NOT
// returned — only the id and label — because the URL is a secret that
// would otherwise be exposed to any group owner viewing the settings.
userRouter.get('/announcements', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = typeof req.query['groupId'] === 'string' ? req.query['groupId'] : ''
  if (!groupId) {
    res.status(400).json({ error: 'validation', message: 'groupId query parameter required' })
    return
  }

  const membership = await db('group_members').where({ group_id: groupId, user_id: userId }).first()
  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member of this group' })
    return
  }

  const rows = await db('group_announcement_webhooks')
    .where({ group_id: groupId })
    .orderBy('created_at', 'asc')
    .select('id', 'label', 'created_at as createdAt')

  res.json({ data: rows, limit: ANNOUNCEMENT_WEBHOOK_LIMIT })
})

// Add an announcement webhook. Owner-only + premium; capped at
// ANNOUNCEMENT_WEBHOOK_LIMIT per group to prevent a runaway fan-out.
userRouter.post('/announcements', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const { groupId, webhookUrl, label } = req.body as {
    groupId?: string
    webhookUrl?: string
    label?: string
  }

  if (!groupId || !webhookUrl) {
    res.status(400).json({ error: 'validation', message: 'groupId and webhookUrl are required' })
    return
  }
  // Minimal URL sanity check — just enough to reject obvious junk without
  // mirroring Discord's webhook format quirks inside the backend.
  try {
    const parsed = new URL(webhookUrl)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('discord.com')) {
      res.status(400).json({ error: 'validation', message: 'webhookUrl must be an https://discord.com/... URL' })
      return
    }
  } catch {
    res.status(400).json({ error: 'validation', message: 'webhookUrl is not a valid URL' })
    return
  }
  if (label !== undefined && (typeof label !== 'string' || label.length > 64)) {
    res.status(400).json({ error: 'validation', message: 'label must be a string of at most 64 characters' })
    return
  }

  if (!(await assertOwnerAndPremium(userId, groupId, res))) return

  const countRow = await db('group_announcement_webhooks')
    .where({ group_id: groupId })
    .count('id as count')
    .first()
  const count = Number(countRow?.count ?? 0)
  if (count >= ANNOUNCEMENT_WEBHOOK_LIMIT) {
    res.status(422).json({
      error: 'limit_reached',
      message: `Maximum ${ANNOUNCEMENT_WEBHOOK_LIMIT} announcement channels per group`,
    })
    return
  }

  try {
    const [row] = await db('group_announcement_webhooks')
      .insert({
        group_id: groupId,
        webhook_url: webhookUrl,
        label: label ?? null,
        created_by: userId,
      })
      .returning(['id', 'label', 'created_at'])
    res.status(201).json({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
    })
  } catch (error) {
    // Unique constraint on (group_id, webhook_url) — already registered
    if (String(error).includes('duplicate')) {
      res.status(409).json({ error: 'conflict', message: 'This channel is already registered' })
      return
    }
    logger.error({ error: String(error), groupId }, 'failed to add announcement webhook')
    res.status(500).json({ error: 'internal', message: 'Failed to add announcement channel' })
  }
})

// Remove an announcement webhook by id. Owner-only, scoped to the caller's
// groups so an owner can't accidentally wipe someone else's channel list.
userRouter.delete('/announcements/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.userId!
  const webhookId = String(req.params['id'])

  const row = await db('group_announcement_webhooks').where({ id: webhookId }).first()
  if (!row) {
    res.status(404).json({ error: 'not_found', message: 'Announcement channel not found' })
    return
  }

  if (!(await assertOwnerAndPremium(userId, row.group_id, res))) return

  await db('group_announcement_webhooks').where({ id: webhookId }).del()
  res.json({ ok: true })
})

export { userRouter as discordUserRoutes }
