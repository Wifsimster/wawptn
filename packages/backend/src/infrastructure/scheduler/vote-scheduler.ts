import cron from 'node-cron'
import { db } from '../database/connection.js'
import { closeSession } from '../../domain/close-session.js'
import { logger } from '../logger/logger.js'

const schedulerLogger = logger.child({ module: 'scheduler' })

export function startVoteScheduler(): void {
  // Poll every 15 seconds for overdue scheduled sessions
  cron.schedule('*/15 * * * * *', async () => {
    try {
      const overdue = await db('voting_sessions')
        .where('status', 'open')
        .whereNotNull('scheduled_at')
        .where('scheduled_at', '<=', db.fn.now())
        .select('id', 'group_id')

      for (const session of overdue) {
        schedulerLogger.info({ sessionId: session.id, groupId: session.group_id }, 'auto-closing scheduled session')
        await closeSession(session.id, session.group_id)
      }
    } catch (err) {
      schedulerLogger.error({ error: String(err) }, 'scheduler tick failed')
    }
  })

  schedulerLogger.info('vote scheduler started (polling every 15s)')
}
