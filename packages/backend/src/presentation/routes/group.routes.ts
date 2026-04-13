import { Router, type Request, type Response } from 'express'
import cron from 'node-cron'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames, countCommonGamesForGroups } from '../../infrastructure/database/common-games.js'
import { generateInviteToken, hashInviteToken } from '../../infrastructure/steam/steam-client.js'
import { triggerBackgroundEnrichment } from '../../infrastructure/steam/steam-store-client.js'
import { getIO, forceLeaveRoom } from '../../infrastructure/socket/socket.js'
import { updateGroupSchedule } from '../../infrastructure/scheduler/auto-vote-scheduler.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { isUserPremium, FREE_TIER_LIMITS, PREMIUM_TIER_LIMITS } from '../middleware/tier.middleware.js'
import { requireGroupMembership } from '../middleware/group-membership.middleware.js'

const router = Router()

// List my groups
router.get('/', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groups = await db('group_members')
    .join('groups', 'groups.id', 'group_members.group_id')
    .where('group_members.user_id', userId)
    .select('groups.*', 'group_members.role')

  const groupIds = groups.map(g => g.id)

  // Get member counts per group
  const memberCounts = groupIds.length > 0
    ? await db('group_members')
        .whereIn('group_id', groupIds)
        .groupBy('group_id')
        .select('group_id', db.raw('COUNT(*) as count'))
    : []
  const memberCountMap = new Map(memberCounts.map((r: { group_id: string; count: string }) => [r.group_id, Number(r.count)]))

  // Get last closed session per group
  const lastSessions = groupIds.length > 0
    ? await db('voting_sessions')
        .whereIn('group_id', groupIds)
        .where('status', 'closed')
        .whereNotNull('winning_game_name')
        .distinctOn('group_id')
        .orderBy([
          { column: 'group_id' },
          { column: 'closed_at', order: 'desc' },
        ])
        .select('group_id', 'winning_game_app_id', 'winning_game_name', 'closed_at')
    : []
  const lastSessionMap = new Map(lastSessions.map((s: { group_id: string; winning_game_app_id: number; winning_game_name: string; closed_at: string }) => [s.group_id, s]))

  // Get member IDs per group for common game counting
  const allMemberships = groupIds.length > 0
    ? await db('group_members')
        .whereIn('group_id', groupIds)
        .select('group_id', 'user_id')
    : []
  const memberIdsMap = new Map<string, string[]>()
  for (const m of allMemberships) {
    const list = memberIdsMap.get(m.group_id) || []
    list.push(m.user_id)
    memberIdsMap.set(m.group_id, list)
  }

  // Count common games per group in a single batched query
  const commonGameCountMap = await countCommonGamesForGroups(
    groups.map((g) => {
      const memberIds = memberIdsMap.get(g.id) || []
      return {
        groupId: g.id as string,
        memberIds,
        threshold: (g.common_game_threshold as number | null) || memberIds.length,
      }
    })
  )

  res.json(groups.map(g => ({
    id: g.id,
    name: g.name,
    role: g.role,
    createdAt: g.created_at,
    memberCount: memberCountMap.get(g.id) || 0,
    commonGameCount: commonGameCountMap.get(g.id) || 0,
    lastSession: lastSessionMap.has(g.id)
      ? {
          gameName: lastSessionMap.get(g.id)!.winning_game_name,
          gameAppId: lastSessionMap.get(g.id)!.winning_game_app_id,
          closedAt: lastSessionMap.get(g.id)!.closed_at,
        }
      : null,
  })))
})

// Get group detail with members
router.get('/:id', requireGroupMembership(), async (req: Request, res: Response) => {
  const groupId = String(req.params['id'])

  const group = await db('groups').where({ id: groupId }).first()
  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Group not found' })
    return
  }

  const members = await db('group_members')
    .join('users', 'users.id', 'group_members.user_id')
    .where('group_members.group_id', groupId)
    .select(
      'users.id',
      'users.steam_id as steamId',
      'users.display_name as displayName',
      'users.avatar_url as avatarUrl',
      'users.library_visible as libraryVisible',
      'group_members.role',
      'group_members.joined_at as joinedAt',
      'group_members.notifications_enabled as notificationsEnabled'
    )

  res.json({
    id: group.id,
    name: group.name,
    createdBy: group.created_by,
    commonGameThreshold: group.common_game_threshold,
    autoVoteSchedule: group.auto_vote_schedule || null,
    autoVoteDurationMinutes: group.auto_vote_duration_minutes || 120,
    createdAt: group.created_at,
    members,
  })
})

// Create group
router.post('/', async (req: Request, res: Response) => {
  const userId = req.userId!
  const { name } = req.body as { name: string }

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: 'validation', message: 'Group name is required' })
    return
  }

  if (name.trim().length > 100) {
    res.status(400).json({ error: 'validation', message: 'Group name must be 100 characters or less' })
    return
  }

  // Free tier: max groups limit
  const premium = await isUserPremium(userId)
  if (!premium) {
    const ownedCount = await db('group_members').where({ user_id: userId, role: 'owner' }).count('* as count').first()
    if (Number(ownedCount?.count || 0) >= FREE_TIER_LIMITS.maxGroups) {
      res.status(403).json({ error: 'premium_required', message: `Free users can create max ${FREE_TIER_LIMITS.maxGroups} groups. Upgrade to premium for unlimited groups.` })
      return
    }
  }

  const { token, hash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours

  const [group] = await db('groups').insert({
    name: name.trim(),
    created_by: userId,
    invite_token_hash: hash,
    invite_expires_at: expiresAt,
    invite_use_count: 0,
    invite_max_uses: 10,
  }).returning('*')

  // Add creator as owner
  await db('group_members').insert({
    group_id: group.id,
    user_id: userId,
    role: 'owner',
  })

  res.status(201).json({
    id: group.id,
    name: group.name,
    inviteToken: token,
    inviteExpiresAt: expiresAt.toISOString(),
  })
})

// Rename group (owner only)
router.patch('/:id', requireGroupMembership({ role: 'owner' }), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])
  const { name } = req.body as { name: string }

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: 'validation', message: 'Group name is required' })
    return
  }

  if (name.trim().length > 100) {
    res.status(400).json({ error: 'validation', message: 'Group name must be 100 characters or less' })
    return
  }

  const trimmedName = name.trim()

  await db('groups').where({ id: groupId }).update({
    name: trimmedName,
    updated_at: db.fn.now(),
  })

  getIO().to(`group:${groupId}`).emit('group:renamed', { groupId, newName: trimmedName })

  logger.info({ userId, groupId, newName: trimmedName }, 'group renamed')
  res.json({ id: groupId, name: trimmedName })
})

// Toggle Discord notifications for current user
router.patch('/:id/notifications', requireGroupMembership(), async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])
  const { enabled } = req.body as { enabled: boolean }

  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'validation', message: 'enabled must be a boolean' })
    return
  }

  await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .update({ notifications_enabled: enabled })

  logger.info({ userId, groupId, notificationsEnabled: enabled }, 'notifications preference updated')
  res.json({ ok: true })
})

// Configure auto-vote schedule (owner only)
router.patch('/:id/auto-vote', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])
  const { schedule, durationMinutes } = req.body as { schedule: string | null; durationMinutes?: number }

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only the group owner can configure auto-vote' })
    return
  }

  // Auto-vote scheduling is a premium feature
  const premium = await isUserPremium(userId)
  if (!premium) {
    res.status(403).json({ error: 'premium_required', message: 'Auto-vote scheduling requires a premium subscription' })
    return
  }

  // Validate cron expression if provided
  if (schedule !== null && schedule !== undefined) {
    if (typeof schedule !== 'string' || schedule.trim().length === 0) {
      res.status(400).json({ error: 'validation', message: 'schedule must be a non-empty string or null' })
      return
    }
    if (!cron.validate(schedule)) {
      res.status(400).json({ error: 'validation', message: 'Invalid cron expression' })
      return
    }
  }

  // Validate duration
  const duration = durationMinutes ?? 120
  if (typeof duration !== 'number' || duration < 5 || duration > 1440) {
    res.status(400).json({ error: 'validation', message: 'durationMinutes must be between 5 and 1440' })
    return
  }

  await db('groups').where({ id: groupId }).update({
    auto_vote_schedule: schedule || null,
    auto_vote_duration_minutes: duration,
    updated_at: db.fn.now(),
  })

  // Immediately update the scheduler
  updateGroupSchedule(groupId, schedule || null, duration)

  logger.info({ userId, groupId, schedule, durationMinutes: duration }, 'auto-vote schedule updated')
  res.json({ ok: true })
})

// Generate new invite link (owner only)
router.post('/:id/invite', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only the group owner can generate invites' })
    return
  }

  const { token, hash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await db('groups').where({ id: groupId }).update({
    invite_token_hash: hash,
    invite_expires_at: expiresAt,
    invite_use_count: 0,
    invite_max_uses: 10,
  })

  res.json({ inviteToken: token, inviteExpiresAt: expiresAt.toISOString() })
})

// Join group via invite token
router.post('/join', async (req: Request, res: Response) => {
  const userId = req.userId!
  const { token } = req.body as { token: string }

  if (!token) {
    res.status(400).json({ error: 'validation', message: 'Invite token is required' })
    return
  }

  const hash = hashInviteToken(token)
  const group = await db('groups')
    .where({ invite_token_hash: hash })
    .where('invite_expires_at', '>', new Date())
    .first()

  if (!group) {
    res.status(404).json({ error: 'not_found', message: 'Invalid or expired invite link' })
    return
  }

  // Check if already a member (before claiming an invite use)
  const existing = await db('group_members')
    .where({ group_id: group.id, user_id: userId })
    .first()

  if (existing) {
    res.json({ id: group.id, name: group.name, alreadyMember: true })
    return
  }

  // Tier-based max members per group limit
  const owner = await db('group_members').where({ group_id: group.id, role: 'owner' }).select('user_id').first()
  if (owner) {
    const ownerIsPremium = await isUserPremium(owner.user_id)
    const memberCount = await db('group_members').where({ group_id: group.id }).count('* as count').first()
    const currentCount = Number(memberCount?.count || 0)
    if (!ownerIsPremium && currentCount >= FREE_TIER_LIMITS.maxMembersPerGroup) {
      res.status(403).json({ error: 'premium_required', message: `This group has reached the free member limit (${FREE_TIER_LIMITS.maxMembersPerGroup}). Group owner must upgrade to premium.` })
      return
    }
    if (ownerIsPremium && currentCount >= PREMIUM_TIER_LIMITS.maxMembersPerGroup) {
      res.status(403).json({ error: 'member_limit', message: `This group has reached the maximum member limit (${PREMIUM_TIER_LIMITS.maxMembersPerGroup}).` })
      return
    }
  }

  // Atomic: claim an invite use and add member in a single transaction (race-safe)
  const joined = await db.transaction(async (trx) => {
    const claimed = await trx('groups')
      .where({ id: group.id })
      .whereRaw('invite_use_count < invite_max_uses')
      .increment('invite_use_count', 1)

    if (claimed === 0) return false

    await trx('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'member',
    })

    return true
  })

  if (!joined) {
    res.status(410).json({ error: 'expired', message: 'This invite link has reached its maximum uses' })
    return
  }

  // Notify group via Socket.io
  const user = await db('users').where({ id: userId }).first()
  if (user) {
    getIO().to(`group:${group.id}`).emit('member:joined', {
      groupId: group.id,
      user: {
        id: user.id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    })
  }

  // Track referral: the group owner (created_by) is the referrer
  if (group.created_by !== userId) {
    await db('referrals')
      .insert({
        referrer_user_id: group.created_by,
        referred_user_id: userId,
        group_id: group.id,
      })
      .onConflict('referred_user_id')
      .ignore()
  }

  logger.info({ userId, groupId: group.id }, 'user joined group')
  res.json({ id: group.id, name: group.name, alreadyMember: false })
})

// Leave group (self) or kick member (owner only)
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.userId!
  const groupId = String(req.params['id'])
  const targetUserId = String(req.params['userId'])
  const isSelfLeave = currentUserId === targetUserId

  // Verify target is actually a member
  const targetMembership = await db('group_members')
    .where({ group_id: groupId, user_id: targetUserId })
    .first()

  if (!targetMembership) {
    res.status(404).json({ error: 'not_found', message: 'User is not a member of this group' })
    return
  }

  if (isSelfLeave) {
    // Owner cannot leave — must delete the group instead
    if (targetMembership.role === 'owner') {
      res.status(403).json({ error: 'forbidden', message: 'Group owner cannot leave. Delete the group instead.' })
      return
    }
  } else {
    // Only the owner can kick other members
    const currentMembership = await db('group_members')
      .where({ group_id: groupId, user_id: currentUserId, role: 'owner' })
      .first()

    if (!currentMembership) {
      res.status(403).json({ error: 'forbidden', message: 'Only the group owner can remove members' })
      return
    }
  }

  await db('group_members')
    .where({ group_id: groupId, user_id: targetUserId })
    .del()

  // Force-evict kicked/left user from socket room
  forceLeaveRoom(groupId, targetUserId)

  if (isSelfLeave) {
    getIO().to(`group:${groupId}`).emit('member:left', { groupId, userId: targetUserId })
  } else {
    // Emit kicked event so the kicked user's frontend can react
    getIO().to(`group:${groupId}`).emit('member:kicked', { groupId, userId: targetUserId })
    // Also notify the kicked user directly (they may have been removed from room already,
    // so emit on their socket specifically)
    const io = getIO()
    for (const [, socket] of io.sockets.sockets) {
      if (socket.data.userId === targetUserId) {
        socket.emit('member:kicked', { groupId, userId: targetUserId })
      }
    }
  }

  logger.info({ currentUserId, targetUserId, groupId, action: isSelfLeave ? 'leave' : 'kick' }, 'member removed from group')
  res.json({ ok: true })
})

// Delete group (owner only)
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only the group owner can delete the group' })
    return
  }

  // Check for open voting sessions
  const openSession = await db('voting_sessions')
    .where({ group_id: groupId, status: 'open' })
    .first()

  if (openSession) {
    res.status(409).json({ error: 'conflict', message: 'Cannot delete group while a voting session is open. Close the vote first.' })
    return
  }

  const group = await db('groups').where({ id: groupId }).first()
  const groupName = group?.name || 'Unknown'

  // Notify all members before deletion
  getIO().to(`group:${groupId}`).emit('group:deleted', { groupId, groupName })

  // Force all sockets out of the room
  const io = getIO()
  const room = io.sockets.adapter.rooms.get(`group:${groupId}`)
  if (room) {
    for (const socketId of Array.from(room)) {
      const s = io.sockets.sockets.get(socketId)
      if (s) s.leave(`group:${groupId}`)
    }
  }

  // Delete the group — CASCADE handles group_members, voting_sessions, votes, etc.
  await db('groups').where({ id: groupId }).del()

  logger.info({ userId, groupId, groupName }, 'group deleted')
  res.json({ ok: true })
})

// Get common games for a group
router.get('/:id/common-games', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const groupId = String(req.params['id'])
    const filter = String(req.query['filter'] || '')

    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }

    const group = await db('groups').where({ id: groupId }).first()
    const memberIds = await db('group_members').where({ group_id: groupId }).pluck('user_id')
    const totalMembers = memberIds.length
    const threshold = group?.common_game_threshold || totalMembers

    const commonGames = await computeCommonGames(memberIds, { filter, threshold })

    // Trigger background enrichment for un-enriched common games
    const allAppIds = commonGames.map(g => g.steamAppId)
    if (allAppIds.length > 0) {
      triggerBackgroundEnrichment(allAppIds)
    }

    res.json({
      games: commonGames.map(g => ({
        ...g,
        gameId: g.gameId || undefined,
        totalMembers,
        genres: g.genres ? JSON.parse(g.genres) : null,
        platforms: g.platforms ? JSON.parse(g.platforms) : null,
        contentDescriptors: g.contentDescriptors ? JSON.parse(g.contentDescriptors) : null,
      })),
      totalMembers,
      threshold,
    })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to load common games')
    res.status(500).json({ error: 'internal', message: 'Failed to load common games' })
  }
})

// Preview common games for a subset of members (read-only, no enrichment)
router.post('/:id/common-games/preview', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const groupId = String(req.params['id'])
    const { memberIds, filter, filters } = req.body as { memberIds: string[]; filter?: string; filters?: { multiplayer?: boolean; coop?: boolean; free?: boolean } }

    if (!Array.isArray(memberIds) || memberIds.length < 2) {
      res.status(400).json({ error: 'validation', message: 'At least 2 member IDs are required' })
      return
    }

    if (memberIds.length > 100) {
      res.status(400).json({ error: 'validation', message: 'Cannot have more than 100 member IDs' })
      return
    }

    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }

    // Validate all provided IDs are actual group members
    const validMembers = await db('group_members')
      .where({ group_id: groupId })
      .whereIn('user_id', memberIds)
      .pluck('user_id')

    const invalidIds = memberIds.filter(id => !validMembers.includes(id))
    if (invalidIds.length > 0) {
      res.status(422).json({ error: 'invalid_members', message: 'Some user IDs are not group members', invalidIds })
      return
    }

    const commonGames = await computeCommonGames(validMembers, { filter, filters })

    res.json({ gameCount: commonGames.length, totalMembers: validMembers.length })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to preview common games')
    res.status(500).json({ error: 'internal', message: 'Failed to preview common games' })
  }
})

// Get group voting stats dashboard
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const groupId = String(req.params['id'])

    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }

    // Total closed sessions
    const totalSessionsResult = await db('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .count('* as count')
      .first()
    const totalSessions = Number(totalSessionsResult?.count || 0)

    // Total individual votes cast across all sessions in this group
    const totalVotesResult = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
      .count('* as count')
      .first()
    const totalVotes = Number(totalVotesResult?.count || 0)

    // Top 5 most winning games (by win count, with total nominations)
    const topGames = await db('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .whereNotNull('winning_game_name')
      .select(
        'winning_game_name as gameName',
        'winning_game_app_id as steamAppId',
      )
      .count('* as winCount')
      .groupBy('winning_game_name', 'winning_game_app_id')
      .orderBy('winCount', 'desc')
      .limit(5) as unknown as { gameName: string; steamAppId: number; winCount: string }[]

    // Count total nominations per game (how many sessions each game appeared in)
    const topGameAppIds = topGames.map(g => g.steamAppId).filter(Boolean)
    let nominationMap = new Map<number, number>()
    if (topGameAppIds.length > 0) {
      const nominations = await db('voting_session_games')
        .join('voting_sessions', 'voting_sessions.id', 'voting_session_games.session_id')
        .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
        .whereIn('voting_session_games.steam_app_id', topGameAppIds)
        .select('voting_session_games.steam_app_id')
        .count('* as totalNominations')
        .groupBy('voting_session_games.steam_app_id') as unknown as { steam_app_id: number; totalNominations: string }[]
      nominationMap = new Map(nominations.map(n => [n.steam_app_id, Number(n.totalNominations)]))
    }

    // Member participation: per member vote count and sessions participated
    const memberParticipation = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .join('users', 'users.id', 'votes.user_id')
      .join('group_members', function () {
        this.on('group_members.user_id', '=', 'votes.user_id')
            .andOn('group_members.group_id', '=', 'voting_sessions.group_id')
      })
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
      .select(
        'votes.user_id as userId',
        'users.display_name as displayName',
        'users.avatar_url as avatarUrl',
      )
      .count('* as voteCount')
      .countDistinct('votes.session_id as sessionsParticipated')
      .groupBy('votes.user_id', 'users.display_name', 'users.avatar_url')
      .orderBy('voteCount', 'desc') as unknown as { userId: string; displayName: string; avatarUrl: string; voteCount: string; sessionsParticipated: string }[]

    // Recent 5 winners with dates
    const recentWinners = await db('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .whereNotNull('winning_game_name')
      .select(
        'winning_game_name as gameName',
        'winning_game_app_id as steamAppId',
        'closed_at as closedAt',
      )
      .orderBy('closed_at', 'desc')
      .limit(5) as unknown as { gameName: string; steamAppId: number; closedAt: string }[]

    res.json({
      totalSessions,
      totalVotes,
      topGames: topGames.map(g => ({
        gameName: g.gameName,
        steamAppId: g.steamAppId,
        winCount: Number(g.winCount),
        totalNominations: nominationMap.get(g.steamAppId) || 0,
      })),
      memberParticipation: memberParticipation.map(m => ({
        userId: m.userId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        voteCount: Number(m.voteCount),
        sessionsParticipated: Number(m.sessionsParticipated),
      })),
      recentWinners: recentWinners.map(w => ({
        gameName: w.gameName,
        steamAppId: w.steamAppId,
        closedAt: w.closedAt,
      })),
    })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to load group stats')
    res.status(500).json({ error: 'internal', message: 'Failed to load group stats' })
  }
})

// Trigger library sync for all group members (owner only)
router.post('/:id/sync', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only the group owner can trigger sync' })
    return
  }

  // Import sync functions dynamically to avoid circular deps
  const { syncUserLibrary, syncEpicLibrary, syncGogLibrary } = await import('./auth.routes.js')

  const members = await db('group_members')
    .join('users', 'users.id', 'group_members.user_id')
    .where('group_members.group_id', groupId)
    .select('users.id', 'users.steam_id')

  // Get linked accounts for all members to sync all platforms
  const memberIds = members.map((m: { id: string }) => m.id)
  const linkedAccounts = await db('accounts')
    .whereIn('user_id', memberIds)
    .whereIn('provider_id', ['epic', 'gog'])
    .where('status', 'active')
    .select('user_id', 'provider_id')

  const emitSynced = (memberId: string, gameCount: number) => {
    const io = getIO()
    io.to(`group:${groupId}`).emit('library:synced', {
      groupId,
      userId: memberId,
      gameCount,
    })
  }

  // Sync in background, one at a time (rate limited)
  for (const member of members) {
    // Steam sync
    syncUserLibrary(member.id, member.steam_id).then((count) => {
      emitSynced(member.id, count)
    }).catch(err => {
      logger.error({ error: String(err), userId: member.id }, 'Steam sync failed for member')
    })

    // Epic sync (if linked)
    const hasEpic = linkedAccounts.some((a: { user_id: string; provider_id: string }) => a.user_id === member.id && a.provider_id === 'epic')
    if (hasEpic) {
      syncEpicLibrary(member.id).then((count) => {
        emitSynced(member.id, count)
      }).catch(err => {
        logger.error({ error: String(err), userId: member.id }, 'Epic sync failed for member')
      })
    }

    // GOG sync (if linked)
    const hasGog = linkedAccounts.some((a: { user_id: string; provider_id: string }) => a.user_id === member.id && a.provider_id === 'gog')
    if (hasGog) {
      syncGogLibrary(member.id).then((count) => {
        emitSynced(member.id, count)
      }).catch(err => {
        logger.error({ error: String(err), userId: member.id }, 'GOG sync failed for member')
      })
    }
  }

  res.json({ ok: true, message: 'Library sync started for all members across all platforms' })
})

// Get smart game recommendations based on vote history
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const groupId = String(req.params['id'])

    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Not a member' })
      return
    }

    // Recommendations are a premium feature
    const premium = await isUserPremium(userId)
    if (!premium) {
      res.status(403).json({ error: 'premium_required', message: 'Game recommendations require a premium subscription' })
      return
    }

    const group = await db('groups').where({ id: groupId }).first()
    const memberIds = await db('group_members').where({ group_id: groupId }).pluck('user_id')
    const totalMembers = memberIds.length
    const threshold = group?.common_game_threshold || totalMembers

    // Get all common games for the group
    const commonGames = await computeCommonGames(memberIds, { threshold })

    if (commonGames.length === 0) {
      res.json({ recommendations: [] })
      return
    }

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    // Get win history for this group: last win date per game (by game_id or steam_app_id)
    const winHistory = await db('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .whereNotNull('winning_game_app_id')
      .select(
        'winning_game_app_id',
        'winning_game_id',
        db.raw('MAX(closed_at) as last_won_at'),
        db.raw('COUNT(*) as win_count')
      )
      .groupBy('winning_game_app_id', 'winning_game_id') as unknown as { winning_game_app_id: number; winning_game_id: string | null; last_won_at: string; win_count: string }[]

    const winMap = new Map<number, { lastWonAt: Date; winCount: number }>(
      winHistory.map((w) => [
        w.winning_game_app_id,
        { lastWonAt: new Date(w.last_won_at), winCount: Number(w.win_count) }
      ])
    )

    // Get positive vote counts per game across all closed sessions in this group
    const positiveVotes = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed', 'votes.vote': true })
      .select('votes.steam_app_id')
      .count('* as positive_count')
      .groupBy('votes.steam_app_id') as unknown as { steam_app_id: number; positive_count: string }[]

    const positiveVoteMap = new Map<number, number>(
      positiveVotes.map((v) => [
        v.steam_app_id, Number(v.positive_count)
      ])
    )

    // Score and filter games
    const now = Date.now()
    const scored = commonGames
      .map(game => {
        const win = winMap.get(game.steamAppId)
        const positiveCount = positiveVoteMap.get(game.steamAppId) || 0

        // Exclude games that won in the last 2 weeks
        if (win && win.lastWonAt > twoWeeksAgo) {
          return null
        }

        let score = 0
        let reason: string

        if (!win) {
          // Never won — highest priority
          score = 1000 + positiveCount
          reason = 'never_played'
        } else {
          // Time since last win in days
          const daysSinceWin = Math.floor((now - win.lastWonAt.getTime()) / (1000 * 60 * 60 * 24))

          if (positiveCount >= 3 && daysSinceWin > 30) {
            // Popular but forgotten
            score = 500 + daysSinceWin + positiveCount * 10
            reason = 'popular_forgotten'
          } else {
            // Not played in a while
            score = daysSinceWin + positiveCount
            reason = 'not_played_long'
          }
        }

        return {
          gameName: game.gameName,
          steamAppId: game.steamAppId,
          headerImageUrl: game.headerImageUrl || `https://cdn.akamai.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`,
          reason,
          score,
        }
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ score: _score, ...rest }) => rest)

    res.json({ recommendations: scored })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to load recommendations')
    res.status(500).json({ error: 'internal', message: 'Failed to load recommendations' })
  }
})

// Get member leaderboard/rankings for a group
router.get('/:id/leaderboard', requireGroupMembership(), async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params['id'])

    // Total votes cast per member in this group's closed sessions
    const memberVotes = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .join('users', 'users.id', 'votes.user_id')
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed' })
      .select(
        'votes.user_id as userId',
        'users.display_name as displayName',
        'users.avatar_url as avatarUrl',
      )
      .count('* as votesCount')
      .countDistinct('votes.session_id as sessionsParticipated')
      .groupBy('votes.user_id', 'users.display_name', 'users.avatar_url') as unknown as {
        userId: string
        displayName: string
        avatarUrl: string
        votesCount: string
        sessionsParticipated: string
      }[]

    // Count wins per member: times user voted for the winning game
    const memberWins = await db('votes')
      .join('voting_sessions', 'voting_sessions.id', 'votes.session_id')
      .where({ 'voting_sessions.group_id': groupId, 'voting_sessions.status': 'closed', 'votes.vote': true })
      .whereNotNull('voting_sessions.winning_game_app_id')
      .whereRaw('votes.steam_app_id = voting_sessions.winning_game_app_id')
      .select('votes.user_id as userId')
      .count('* as winsCount')
      .groupBy('votes.user_id') as unknown as { userId: string; winsCount: string }[]

    const winsMap = new Map(memberWins.map(w => [w.userId, Number(w.winsCount)]))

    const leaderboard = memberVotes
      .map(m => ({
        userId: m.userId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        votesCount: Number(m.votesCount),
        sessionsParticipated: Number(m.sessionsParticipated),
        winsCount: winsMap.get(m.userId) || 0,
      }))
      .sort((a, b) => b.votesCount - a.votesCount)

    res.json(leaderboard)
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to load group leaderboard')
    res.status(500).json({ error: 'internal', message: 'Failed to load group leaderboard' })
  }
})

// Get voting streaks for a group
router.get('/:id/streaks', requireGroupMembership(), async (req: Request, res: Response) => {
  try {
    const groupId = String(req.params['id'])

    const { getGroupStreaks } = await import('../../domain/streaks.js')
    const streaks = await getGroupStreaks(groupId)

    res.json({ streaks })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to load group streaks')
    res.status(500).json({ error: 'internal', message: 'Failed to load group streaks' })
  }
})

export { router as groupRoutes }
