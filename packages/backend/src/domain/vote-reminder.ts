import { db } from '../infrastructure/database/connection.js'
import { createNotification } from '../infrastructure/notifications/notification-service.js'
import { logger } from '../infrastructure/logger/logger.js'

const reminderLogger = logger.child({ module: 'vote-reminder' })

/**
 * Send vote reminders for open voting sessions that have been open for more than 1 hour
 * where not all participants have voted yet.
 *
 * Uses the `reminder_sent_at` column on `voting_sessions` to avoid spamming —
 * a session only gets one reminder per lifetime.
 */
export async function sendVoteReminders(): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // Find open sessions that are older than 1 hour and haven't had a reminder sent yet
    const eligibleSessions = await db('voting_sessions')
      .where('status', 'open')
      .where('created_at', '<=', oneHourAgo)
      .whereNull('reminder_sent_at')
      .select('id', 'group_id')

    if (eligibleSessions.length === 0) return

    reminderLogger.info({ sessionCount: eligibleSessions.length }, 'processing vote reminders')

    for (const session of eligibleSessions) {
      try {
        await processSessionReminder(session.id, session.group_id)
      } catch (err) {
        reminderLogger.error(
          { error: String(err), sessionId: session.id, groupId: session.group_id },
          'failed to send reminder for session'
        )
      }
    }
  } catch (err) {
    reminderLogger.error({ error: String(err) }, 'sendVoteReminders failed')
  }
}

async function processSessionReminder(sessionId: string, groupId: string): Promise<void> {
  // Get all participant IDs for this session
  const participantIds: string[] = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .pluck('user_id')

  if (participantIds.length === 0) return

  // Get distinct user IDs who have already cast at least one vote in this session
  const voterIds: string[] = await db('votes')
    .where({ session_id: sessionId })
    .distinct('user_id')
    .pluck('user_id')

  const voterSet = new Set(voterIds)
  const pendingUserIds = participantIds.filter((uid) => !voterSet.has(uid))

  if (pendingUserIds.length === 0) {
    // Everyone has voted — mark as reminded to skip in future ticks
    await db('voting_sessions')
      .where({ id: sessionId })
      .update({ reminder_sent_at: db.fn.now() })
    return
  }

  // Get the number of games in this session (for the notification body)
  const gameCountResult = await db('voting_session_games')
    .where({ session_id: sessionId })
    .count('* as count')
    .first()

  const gameCount = Number(gameCountResult?.count || 0)

  // Get group name for the notification
  const group = await db('groups').where({ id: groupId }).select('name').first()
  const groupName = group?.name || 'votre groupe'

  // Send in-app notification to pending voters (non-blocking pattern)
  createNotification({
    type: 'vote_reminder',
    title: `N'oubliez pas de voter !`,
    body: `Il reste ${gameCount} jeux à départager dans ${groupName}`,
    groupId,
    metadata: { sessionId, actionUrl: `/groups/${groupId}/vote` },
    recipientUserIds: pendingUserIds,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  }).catch((err) =>
    reminderLogger.warn({ error: String(err), sessionId, groupId }, 'vote reminder notification failed')
  )

  // Mark session as reminded to avoid duplicate reminders
  await db('voting_sessions')
    .where({ id: sessionId })
    .update({ reminder_sent_at: db.fn.now() })

  reminderLogger.info(
    { sessionId, groupId, pendingCount: pendingUserIds.length, totalParticipants: participantIds.length },
    'vote reminder sent'
  )
}
