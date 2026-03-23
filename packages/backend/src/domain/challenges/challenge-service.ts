import { db } from '../../infrastructure/database/connection.js'
import { getIO } from '../../infrastructure/socket/socket.js'
import { createNotification } from '../../infrastructure/notifications/notification-service.js'
import { logger } from '../../infrastructure/logger/logger.js'
import type { ChallengeProgress } from '@wawptn/types'

const challengeLogger = logger.child({ module: 'challenges' })

/** Evaluation strategies keyed by challenge category */
interface EvalResult {
  challengeId: string
  progress: number
}

async function evaluatePlaytime(userId: string): Promise<EvalResult[]> {
  const row = await db('user_games')
    .where({ user_id: userId })
    .sum('playtime_forever as total')
    .first()
  const total = Number(row?.total || 0)

  return [
    { challengeId: 'playtime_100h', progress: total },
    { challengeId: 'playtime_500h', progress: total },
    { challengeId: 'playtime_1000h', progress: total },
  ]
}

async function evaluateDedication(userId: string): Promise<EvalResult[]> {
  const row = await db('user_games')
    .where({ user_id: userId })
    .max('playtime_forever as max_playtime')
    .first()
  const maxPlaytime = Number(row?.max_playtime || 0)

  return [
    { challengeId: 'single_game_100h', progress: maxPlaytime },
    { challengeId: 'single_game_500h', progress: maxPlaytime },
  ]
}

async function evaluateCollection(userId: string): Promise<EvalResult[]> {
  const row = await db('user_games')
    .where({ user_id: userId })
    .count('* as count')
    .first()
  const count = Number(row?.count || 0)

  return [
    { challengeId: 'library_50', progress: count },
    { challengeId: 'library_200', progress: count },
  ]
}

async function evaluateParticipation(userId: string): Promise<EvalResult[]> {
  const row = await db('votes')
    .where({ user_id: userId })
    .countDistinct('session_id as count')
    .first()
  const count = Number(row?.count || 0)

  return [
    { challengeId: 'votes_10', progress: count },
    { challengeId: 'votes_50', progress: count },
  ]
}

const CATEGORY_EVALUATORS: Record<string, (userId: string) => Promise<EvalResult[]>> = {
  playtime: evaluatePlaytime,
  dedication: evaluateDedication,
  collection: evaluateCollection,
  participation: evaluateParticipation,
}

/**
 * Evaluate challenges for a user in the given categories.
 * Updates progress, detects new unlocks, fires notifications.
 */
export async function evaluateChallenges(
  userId: string,
  categories: string[],
): Promise<void> {
  // Gather all eval results for requested categories
  const allResults: EvalResult[] = []
  for (const category of categories) {
    const evaluator = CATEGORY_EVALUATORS[category]
    if (evaluator) {
      const results = await evaluator(userId)
      allResults.push(...results)
    }
  }

  if (allResults.length === 0) return

  // Fetch thresholds for these challenges
  const challengeIds = allResults.map(r => r.challengeId)
  const definitions = await db('challenges').whereIn('id', challengeIds)
  const defMap = new Map(definitions.map((d: { id: string; threshold: number; title: string; description: string; icon: string; tier: number }) => [d.id, d]))

  for (const result of allResults) {
    const def = defMap.get(result.challengeId)
    if (!def) continue

    const isUnlocked = result.progress >= def.threshold

    // Upsert progress — only set unlocked_at once via COALESCE
    await db.raw(`
      INSERT INTO user_challenges (user_id, challenge_id, progress, unlocked_at, notified, updated_at)
      VALUES (?, ?, ?, ?, false, NOW())
      ON CONFLICT (user_id, challenge_id)
      DO UPDATE SET
        progress = EXCLUDED.progress,
        unlocked_at = COALESCE(user_challenges.unlocked_at, EXCLUDED.unlocked_at),
        updated_at = NOW()
    `, [userId, result.challengeId, result.progress, isUnlocked ? new Date() : null])

    // Check if newly unlocked (notified = false AND unlocked_at is set)
    if (isUnlocked) {
      const updated = await db('user_challenges')
        .where({ user_id: userId, challenge_id: result.challengeId, notified: false })
        .whereNotNull('unlocked_at')
        .update({ notified: true })

      if (updated > 0) {
        // New unlock — notify via Socket.io and in-app
        challengeLogger.info(
          { userId, challengeId: result.challengeId },
          'challenge unlocked',
        )

        getIO().to(`user:${userId}`).emit('challenge:unlocked', {
          userId,
          challengeId: result.challengeId,
          title: def.title,
          icon: def.icon,
          tier: def.tier,
        })

        createNotification({
          type: 'challenge_unlocked',
          title: `${def.icon} Défi débloqué : ${def.title}`,
          body: def.description,
          metadata: { challengeId: result.challengeId, tier: def.tier },
          recipientUserIds: [userId],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        }).catch(err =>
          challengeLogger.warn({ error: String(err) }, 'challenge notification failed'),
        )
      }
    }
  }
}

/**
 * Get all challenge progress for a user (computed live + merged with stored progress).
 */
export async function getChallengesForUser(userId: string): Promise<ChallengeProgress[]> {
  // First, evaluate all categories to ensure progress is fresh
  await evaluateChallenges(userId, ['playtime', 'dedication', 'collection', 'participation'])

  // Then read the materialized state
  const rows = await db('challenges')
    .leftJoin('user_challenges', function () {
      this.on('challenges.id', '=', 'user_challenges.challenge_id')
        .andOn('user_challenges.user_id', '=', db.raw('?', [userId]))
    })
    .orderBy('challenges.sort_order', 'asc')
    .select(
      'challenges.id',
      'challenges.category',
      'challenges.title',
      'challenges.description',
      'challenges.icon',
      'challenges.tier',
      'challenges.threshold',
      'user_challenges.progress',
      'user_challenges.unlocked_at',
    )

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    description: r.description as string,
    icon: r.icon as string,
    tier: r.tier as number,
    threshold: r.threshold as number,
    progress: Number(r.progress || 0),
    percentage: Math.min(100, Math.round((Number(r.progress || 0) / (r.threshold as number)) * 100)),
    unlockedAt: r.unlocked_at ? (r.unlocked_at as Date).toISOString() : null,
  }))
}
