import { Router, type Request, type Response, type NextFunction } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

/**
 * User profile routes — power the "view another user's profile" and
 * "compare with me" flows. See issue #142 for the full design.
 *
 * Authorization rule (Julien's red line): the viewer must share at
 * least one group with the target. There is no global directory.
 * URL params use the internal UUID `users.id`, never the Steam ID.
 */

// ── Types ───────────────────────────────────────────────────────────

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

// UUID validation — matches the shape postgres gen_random_uuid() emits.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Authz helper ────────────────────────────────────────────────────

/**
 * Returns true if `viewerId` and `targetId` share at least one group.
 * A user is always co-member of themselves for this check.
 */
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

// ── Query helpers ───────────────────────────────────────────────────

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

/**
 * Compute the games owned by both users, with per-user playtime.
 * Ordered by combined playtime desc so the UI shows the most-played
 * common games first.
 */
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

// ── Response shaping ────────────────────────────────────────────────

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

// ── Shared guard ────────────────────────────────────────────────────

/**
 * Middleware factory that looks up a target user by their UUID from
 * a route param, ensures the viewer is a co-member, and stashes the
 * resolved user row on `res.locals.target`. Returns 404 for both
 * "not found" and "not a co-member" so an attacker cannot enumerate
 * which UUIDs correspond to real accounts.
 */
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

// ── Routes ──────────────────────────────────────────────────────────

// GET /api/users/me/visibility — read own visibility toggles
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

// PATCH /api/users/me/visibility — update own visibility toggles
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

// GET /api/users/compare?a=:userIdA&b=:userIdB — two-user comparison
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

    // Games only owned by A or B — only populated when each side has
    // opted in to sharing their full library, otherwise it would leak
    // ownership outside the intersection.
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

// GET /api/users/:userId/profile — single profile, co-member scoped
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
