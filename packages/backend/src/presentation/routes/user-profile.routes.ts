import { Router, type Request, type Response, type NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { requireSameOrigin } from '../middleware/csrf.middleware.js'
import { SESSION_COOKIE_NAME } from '../../config/session.js'

const router = Router()


interface UserRow {
  id: string
  display_name: string
  avatar_url: string | null
  last_games_sync_at: Date | null
  visibility_full_library: boolean
  visibility_last_played: boolean
}

interface GameRow {
  steam_app_id: number
  game_name: string
  header_image_url: string | null
  playtime_forever: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function areCoMembers(viewerId: string, targetId: string): Promise<boolean> {
  if (viewerId === targetId) return true
  const row = await db('group_members as viewer')
    .join('group_members as target', 'viewer.group_id', 'target.group_id')
    .where('viewer.user_id', viewerId)
    .andWhere('target.user_id', targetId)
    .select('viewer.group_id')
    .first()
  return !!row
}

async function loadUser(userId: string): Promise<UserRow | null> {
  const row = await db('users')
    .where({ id: userId })
    .select(
      'id',
      'display_name',
      'avatar_url',
      'last_games_sync_at',
      'visibility_full_library',
      'visibility_last_played'
    )
    .first()
  return row ?? null
}

async function loadGameCount(userId: string): Promise<number> {
  const row = await db('user_games').where({ user_id: userId }).count('* as count').first()
  return Number(row?.count ?? 0)
}

async function loadTotalPlaytime(userId: string): Promise<number> {
  const row = await db('user_games')
    .where({ user_id: userId })
    .sum({ total: 'playtime_forever' })
    .first()
  return Number(row?.total ?? 0)
}

async function loadTopGames(userId: string, limit: number): Promise<GameRow[]> {
  return db('user_games')
    .where({ user_id: userId })
    .orderBy('playtime_forever', 'desc')
    .limit(limit)
    .select('steam_app_id', 'game_name', 'header_image_url', 'playtime_forever')
}

async function loadCommonGames(
  userIdA: string,
  userIdB: string,
  limit: number
): Promise<Array<GameRow & { playtime_a: number | null; playtime_b: number | null }>> {
  const rows = await db('user_games as a')
    .join('user_games as b', function () {
      this.on('a.steam_app_id', '=', 'b.steam_app_id')
    })
    .where('a.user_id', userIdA)
    .andWhere('b.user_id', userIdB)
    .orderByRaw('COALESCE(a.playtime_forever, 0) + COALESCE(b.playtime_forever, 0) DESC')
    .limit(limit)
    .select(
      'a.steam_app_id as steam_app_id',
      'a.game_name as game_name',
      'a.header_image_url as header_image_url',
      'a.playtime_forever as playtime_a',
      'b.playtime_forever as playtime_b'
    )
  return rows.map((r) => ({
    steam_app_id: r.steam_app_id,
    game_name: r.game_name,
    header_image_url: r.header_image_url,
    playtime_forever: r.playtime_a,
    playtime_a: r.playtime_a,
    playtime_b: r.playtime_b,
  }))
}

function serializeGame(row: GameRow) {
  return {
    steamAppId: row.steam_app_id,
    gameName: row.game_name,
    headerImageUrl: row.header_image_url,
    playtimeForever: row.playtime_forever,
  }
}

async function buildPublicProfile(viewerId: string, target: UserRow) {
  const [gameCount, commonRaw, topRaw] = await Promise.all([
    loadGameCount(target.id),
    loadCommonGames(viewerId, target.id, 50),
    target.visibility_full_library ? loadTopGames(target.id, 20) : Promise.resolve(null),
  ])

  const totalPlaytimeMinutes = target.visibility_full_library ? await loadTotalPlaytime(target.id) : null

  return {
    id: target.id,
    displayName: target.display_name,
    avatarUrl: target.avatar_url,
    gameCount,
    totalPlaytimeMinutes,
    commonGamesWithViewer: commonRaw.map(serializeGame),
    topGames: topRaw ? topRaw.map(serializeGame) : null,
    lastSyncedAt: target.last_games_sync_at ? target.last_games_sync_at.toISOString() : null,
    visibilityFullLibrary: target.visibility_full_library,
    visibilityLastPlayed: target.visibility_last_played,
  }
}

function requireCoMember(paramName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const targetId = String(req.params[paramName] ?? '')
    if (!UUID_RE.test(targetId)) {
      res.status(404).json({ error: 'not_found', message: 'User not found' })
      return
    }
    try {
      const [target, coMember] = await Promise.all([
        loadUser(targetId),
        areCoMembers(req.userId!, targetId),
      ])
      if (!target || !coMember) {
        res.status(404).json({ error: 'not_found', message: 'User not found' })
        return
      }
      res.locals['target'] = target
      next()
    } catch (error) {
      logger.error(
        { error: String(error), viewerId: req.userId, targetId },
        'user-profile: co-member lookup failed'
      )
      res.status(500).json({ error: 'internal', message: 'Failed to load profile' })
    }
  }
}

router.get('/me/visibility', async (req: Request, res: Response) => {
  const row = await db('users')
    .where({ id: req.userId! })
    .select('visibility_full_library', 'visibility_last_played')
    .first()
  if (!row) {
    res.status(404).json({ error: 'not_found', message: 'User not found' })
    return
  }
  res.json({
    visibilityFullLibrary: row.visibility_full_library,
    visibilityLastPlayed: row.visibility_last_played,
  })
})

router.get('/me/streaks', async (req: Request, res: Response) => {
  const { getUserStreakSummary } = await import('../../domain/streaks.js')
  const summary = await getUserStreakSummary(req.userId!)
  res.json(summary)
})

router.patch('/me/visibility', async (req: Request, res: Response) => {
  const { visibilityFullLibrary, visibilityLastPlayed } = req.body as {
    visibilityFullLibrary?: unknown
    visibilityLastPlayed?: unknown
  }

  const patch: Record<string, boolean> = {}
  if (typeof visibilityFullLibrary === 'boolean') {
    patch['visibility_full_library'] = visibilityFullLibrary
  }
  if (typeof visibilityLastPlayed === 'boolean') {
    patch['visibility_last_played'] = visibilityLastPlayed
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'validation', message: 'No valid fields to update' })
    return
  }

  await db('users').where({ id: req.userId! }).update(patch)
  const updated = await db('users')
    .where({ id: req.userId! })
    .select('visibility_full_library', 'visibility_last_played')
    .first()
  res.json({
    visibilityFullLibrary: updated.visibility_full_library,
    visibilityLastPlayed: updated.visibility_last_played,
  })
})

router.get('/me/export', async (req: Request, res: Response) => {
  const { exportUserData } = await import('../../domain/account-deletion.js')
  const data = await exportUserData(req.userId!)
  res.setHeader('Content-Disposition', 'attachment; filename="wawptn-data-export.json"')
  res.json(data)
})

router.delete('/me', requireSameOrigin, async (req: Request, res: Response) => {
  const userId = req.userId!
  const { deleteUserAccount } = await import('../../domain/account-deletion.js')
  await deleteUserAccount(userId)
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
  logger.info({ userId }, 'account deleted at user request')
  res.json({ ok: true })
})

router.get('/compare', async (req: Request, res: Response) => {
  const viewerId = req.userId!
  const a = String(req.query['a'] ?? '')
  const b = String(req.query['b'] ?? '')

  if (!UUID_RE.test(a) || !UUID_RE.test(b)) {
    res.status(400).json({ error: 'validation', message: 'Invalid user id(s)' })
    return
  }
  if (a === b) {
    res.status(400).json({ error: 'validation', message: 'Cannot compare a user with themselves' })
    return
  }

  try {
    const [targetA, targetB, coMemberA, coMemberB] = await Promise.all([
      loadUser(a),
      loadUser(b),
      areCoMembers(viewerId, a),
      areCoMembers(viewerId, b),
    ])

    if (!targetA || !targetB || !coMemberA || !coMemberB) {
      res.status(404).json({ error: 'not_found', message: 'User(s) not found' })
      return
    }

    const [profileA, profileB, commonRaw, gameCountA, gameCountB] = await Promise.all([
      buildPublicProfile(viewerId, targetA),
      buildPublicProfile(viewerId, targetB),
      loadCommonGames(a, b, 100),
      loadGameCount(a),
      loadGameCount(b),
    ])

    const [topRawA, topRawB] = await Promise.all([
      targetA.visibility_full_library ? loadTopGames(a, 50) : Promise.resolve([]),
      targetB.visibility_full_library ? loadTopGames(b, 50) : Promise.resolve([]),
    ])

    const commonIds = new Set(commonRaw.map((r) => r.steam_app_id))
    const onlyA = topRawA.filter((g) => !commonIds.has(g.steam_app_id)).map(serializeGame)
    const onlyB = topRawB.filter((g) => !commonIds.has(g.steam_app_id)).map(serializeGame)

    const commonCount = commonRaw.length
    const totalDistinct = gameCountA + gameCountB - commonCount
    const overlapRatio = totalDistinct > 0 ? commonCount / totalDistinct : 0

    res.json({
      a: profileA,
      b: profileB,
      commonGames: commonRaw.map((r) => ({
        steamAppId: r.steam_app_id,
        gameName: r.game_name,
        headerImageUrl: r.header_image_url,
        playtimeA: r.playtime_a,
        playtimeB: r.playtime_b,
      })),
      onlyAGames: onlyA,
      onlyBGames: onlyB,
      overlapRatio,
    })
  } catch (error) {
    logger.error(
      { error: String(error), viewerId, a, b },
      'user-profile: compare failed'
    )
    res.status(500).json({ error: 'internal', message: 'Failed to compare profiles' })
  }
})

router.get('/:userId/profile', requireCoMember('userId'), async (req: Request, res: Response) => {
  const target = res.locals['target'] as UserRow
  try {
    const profile = await buildPublicProfile(req.userId!, target)
    res.json(profile)
  } catch (error) {
    logger.error(
      { error: String(error), viewerId: req.userId, targetId: target.id },
      'user-profile: profile fetch failed'
    )
    res.status(500).json({ error: 'internal', message: 'Failed to load profile' })
  }
})

export { router as userProfileRoutes }
