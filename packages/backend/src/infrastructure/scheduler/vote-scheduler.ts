import cron from 'node-cron'
import { db } from '../database/connection.js'
import { closeSession } from '../../domain/close-session.js'
import { sendVoteReminders } from '../../domain/vote-reminder.js'
import { logger } from '../logger/logger.js'

const schedulerLogger = logger.child({ module: 'scheduler' })

export function startVoteScheduler(): void {
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

  cron.schedule('*/5 * * * *', async () => {
    try {
      const deleted = await db('discord_link_codes').where('expires_at', '<', db.fn.now()).del()
      if (deleted > 0) {
        schedulerLogger.info({ deleted }, 'cleaned up expired Discord link codes')
      }
    } catch (err) {
      schedulerLogger.error({ error: String(err) }, 'Discord link code cleanup failed')
    }
  })

  cron.schedule('*/30 * * * *', async () => {
    try {
      await sendVoteReminders()
    } catch (err) {
      schedulerLogger.error({ error: String(err) }, 'vote reminder tick failed')
    }
  })

  schedulerLogger.info('vote scheduler started (polling every 15s)')
}
