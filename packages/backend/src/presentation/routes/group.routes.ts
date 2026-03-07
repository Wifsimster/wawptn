import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames } from '../../infrastructure/database/common-games.js'
import { generateInviteToken, hashInviteToken } from '../../infrastructure/steam/steam-client.js'
import { triggerBackgroundEnrichment } from '../../infrastructure/steam/steam-store-client.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { logger } from '../../infrastructure/logger/logger.js'

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

  res.json(groups.map(g => ({
    id: g.id,
    name: g.name,
    role: g.role,
    createdAt: g.created_at,
    memberCount: memberCountMap.get(g.id) || 0,
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
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])

  // Verify membership
  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member of this group' })
    return
  }

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
      'group_members.joined_at as joinedAt'
    )

  res.json({
    id: group.id,
    name: group.name,
    createdBy: group.created_by,
    commonGameThreshold: group.common_game_threshold,
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

// Generate new invite link
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

  if (group.invite_use_count >= group.invite_max_uses) {
    res.status(410).json({ error: 'expired', message: 'This invite link has reached its maximum uses' })
    return
  }

  // Check if already a member
  const existing = await db('group_members')
    .where({ group_id: group.id, user_id: userId })
    .first()

  if (existing) {
    res.json({ id: group.id, name: group.name, alreadyMember: true })
    return
  }

  // Add member
  await db('group_members').insert({
    group_id: group.id,
    user_id: userId,
    role: 'member',
  })

  // Increment use count
  await db('groups').where({ id: group.id }).increment('invite_use_count', 1)

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

  logger.info({ userId, groupId: group.id }, 'user joined group')
  res.json({ id: group.id, name: group.name, alreadyMember: false })
})

// Leave group or kick member
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  const currentUserId = req.userId!
  const groupId = String(req.params['id'])
  const targetUserId = String(req.params['userId'])

  // Check if current user is the target (leaving) or an owner (kicking)
  if (currentUserId !== targetUserId) {
    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: currentUserId, role: 'owner' })
      .first()

    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Only the group owner can remove members' })
      return
    }
  }

  await db('group_members')
    .where({ group_id: groupId, user_id: targetUserId })
    .del()

  getIO().to(`group:${groupId}`).emit('member:left', { groupId, userId: targetUserId })

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
      games: commonGames.map(g => ({ ...g, totalMembers })),
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
    const { memberIds, filter } = req.body as { memberIds: string[]; filter?: string }

    if (!Array.isArray(memberIds) || memberIds.length < 2) {
      res.status(400).json({ error: 'validation', message: 'At least 2 member IDs are required' })
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

    const commonGames = await computeCommonGames(validMembers, { filter })

    res.json({ gameCount: commonGames.length, totalMembers: validMembers.length })
  } catch (error) {
    logger.error({ error: String(error), groupId: req.params['id'] }, 'failed to preview common games')
    res.status(500).json({ error: 'internal', message: 'Failed to preview common games' })
  }
})

// Trigger library sync for all group members
router.post('/:id/sync', async (req: Request, res: Response) => {
  const userId = req.userId!
  const groupId = String(req.params['id'])

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Not a member' })
    return
  }

  // Import syncUserLibrary dynamically to avoid circular deps
  const { syncUserLibrary } = await import('./auth.routes.js')

  const members = await db('group_members')
    .join('users', 'users.id', 'group_members.user_id')
    .where('group_members.group_id', groupId)
    .select('users.id', 'users.steam_id')

  // Sync in background, one at a time (rate limited)
  for (const member of members) {
    syncUserLibrary(member.id, member.steam_id).then(() => {
      const io = getIO()
      io.to(`group:${groupId}`).emit('library:synced', {
        groupId,
        userId: member.id,
        gameCount: 0, // will be updated
      })
    }).catch(err => {
      logger.error({ error: String(err), userId: member.id }, 'sync failed for member')
    })
  }

  res.json({ ok: true, message: 'Library sync started for all members' })
})

export { router as groupRoutes }
