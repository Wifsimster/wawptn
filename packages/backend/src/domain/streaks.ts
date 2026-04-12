import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'

const streakLogger = logger.child({ module: 'streaks' })

/**
 * Update a user's voting streak for a group after a session closes.
 *
 * Logic:
 * - If this is the user's first tracked session, start the streak at 1.
 * - If the user already has a streak and the last_session_id is the immediately
 *   preceding closed session in this group, increment current_streak.
 * - Otherwise, the user missed a session — reset current_streak to 1.
 * - best_streak is updated whenever current_streak exceeds it.
 *
 * Uses upsert (INSERT ... ON CONFLICT DO UPDATE) to handle first-time and
 * returning participants in a single query.
 */
export async function updateStreak(
  userId: string,
  groupId: string,
  sessionId: string,
): Promise<void> {
  // Find the session that closed immediately before this one in the same group
  const previousSession = await db('voting_sessions')
    .where({ group_id: groupId, status: 'closed' })
    .where('id', '!=', sessionId)
    .orderBy('closed_at', 'desc')
    .select('id')
    .first()

  const previousSessionId = previousSession?.id ?? null

  // Get current streak row (if any)
  const existing = await db('streaks')
    .where({ user_id: userId, group_id: groupId })
    .first()

  let newStreak: number

  if (!existing) {
    // First time — start at 1
    newStreak = 1
  } else if (existing.last_session_id === sessionId) {
    // Already processed this session for this user — idempotent, skip
    return
  } else if (previousSessionId && existing.last_session_id === previousSessionId) {
    // Consecutive participation — increment
    newStreak = existing.current_streak + 1
  } else {
    // Missed one or more sessions — reset to 1
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

/**
 * Get all streaks for a group, joined with user info, sorted by current_streak desc.
 */
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
