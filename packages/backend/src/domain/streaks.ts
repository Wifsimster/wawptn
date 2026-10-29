import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import type { IGroupRepository } from './repositories/group-repository.js'

const streakLogger = logger.child({ module: 'streaks' })

export interface StreakDeps {
  groupRepository?: IGroupRepository
}

export async function updateStreak(
  userId: string,
  groupId: string,
  sessionId: string,
  _deps: StreakDeps = {},
): Promise<void> {
  const previousSession = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .where('id', '!=', sessionId)
    .orderBy('closed_at', 'desc')
    .select('id')
    .first()

  const previousSessionId = previousSession?.id ?? null

  const existing = await db('streaks')
    .where({ user_id: userId, group_id: groupId })
    .first()

  let newStreak: number

  if (!existing) {
    newStreak = 1
  } else if (existing.last_session_id === sessionId) {
    return
  } else if (previousSessionId && existing.last_session_id === previousSessionId) {
    newStreak = existing.current_streak + 1
  } else {
    newStreak = 1
  }

  const bestStreak = existing ? Math.max(existing.best_streak, newStreak) : newStreak

  await db.raw(`
    INSERT INTO streaks (user_id, group_id, current_streak, best_streak, last_session_id, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW())
    ON CONFLICT (user_id, group_id)
    DO UPDATE SET
      current_streak = EXCLUDED.current_streak,
      best_streak = GREATEST(streaks.best_streak, EXCLUDED.best_streak),
      last_session_id = EXCLUDED.last_session_id,
      updated_at = NOW()
  `, [userId, groupId, newStreak, bestStreak, sessionId])

  streakLogger.info(
    { userId, groupId, sessionId, currentStreak: newStreak, bestStreak },
    'streak updated',
  )
}

export async function getGroupStreaks(groupId: string): Promise<Array<{
  userId: string
  displayName: string
  avatarUrl: string | null
  currentStreak: number
  bestStreak: number
  updatedAt: string
}>> {
  const rows = await db('streaks')
    .join('users', 'users.id', 'streaks.user_id')
    .where('streaks.group_id', groupId)
    .select(
      'streaks.user_id as userId',
      'users.display_name as displayName',
      'users.avatar_url as avatarUrl',
      'streaks.current_streak as currentStreak',
      'streaks.best_streak as bestStreak',
      'streaks.updated_at as updatedAt',
    )
    .orderBy('streaks.current_streak', 'desc')

  return rows.map((r: Record<string, unknown>) => ({
    userId: r.userId as string,
    displayName: r.displayName as string,
    avatarUrl: (r.avatarUrl as string | null) ?? null,
    currentStreak: Number(r.currentStreak),
    bestStreak: Number(r.bestStreak),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }))
}

export async function getUserStreakSummary(userId: string): Promise<{
  bestCurrent: number
  bestEver: number
  activeStreakGroups: number
}> {
  const rows = await db('streaks')
    .where({ user_id: userId })
    .select<{ current_streak: number; best_streak: number }[]>('current_streak', 'best_streak')

  if (rows.length === 0) {
    return { bestCurrent: 0, bestEver: 0, activeStreakGroups: 0 }
  }

  let bestCurrent = 0
  let bestEver = 0
  let activeStreakGroups = 0
  for (const row of rows) {
    const cur = Number(row.current_streak)
    const ever = Number(row.best_streak)
    if (cur > bestCurrent) bestCurrent = cur
    if (ever > bestEver) bestEver = ever
    if (cur >= 2) activeStreakGroups++
  }

  return { bestCurrent, bestEver, activeStreakGroups }
}
