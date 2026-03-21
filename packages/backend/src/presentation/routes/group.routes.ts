import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { computeCommonGames, countCommonGames } from '../../infrastructure/database/common-games.js'
import { generateInviteToken, hashInviteToken } from '../../infrastructure/steam/steam-client.js'
import { triggerBackgroundEnrichment } from '../../infrastructure/steam/steam-store-client.js'
import { getIO, forceLeaveRoom } from '../../infrastructure/socket/socket.js'
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

  // Count common games per group in parallel
  const commonGameCounts = await Promise.all(
    groups.map(async (g) => {
      const memberIds = memberIdsMap.get(g.id) || []
      if (memberIds.length < 1) return 0
      const threshold = g.common_game_threshold || memberIds.length
      return countCommonGames(memberIds, threshold)
    })
  )
  const commonGameCountMap = new Map(groups.map((g, i) => [g.id, commonGameCounts[i]]))

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

// Rename group (owner only)
router.patch('/:id', async (req: Request, res: Response) => {
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

  const membership = await db('group_members')
    .where({ group_id: groupId, user_id: userId, role: 'owner' })
    .first()

  if (!membership) {
    res.status(403).json({ error: 'forbidden', message: 'Only the group owner can rename the group' })
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

export { router as groupRoutes }
