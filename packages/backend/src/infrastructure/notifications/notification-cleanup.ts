import cron from 'node-cron'
import { cleanupExpiredNotifications } from './notification-service.js'
import { logger } from '../logger/logger.js'

const cleanupLogger = logger.child({ module: 'notification-cleanup' })

/**
 * Start a weekly cron job to clean up expired notifications.
 * Runs every Sunday at 3:00 AM.
 */
export function startNotificationCleanup(): void {
  cron.schedule('0 3 * * 0', async () => {
    try {
      const deleted = await cleanupExpiredNotifications()
      cleanupLogger.info({ deleted }, 'notification cleanup completed')
    } catch (error) {
      cleanupLogger.error({ error: String(error) }, 'notification cleanup failed')
    }
  })

  cleanupLogger.info('notification cleanup scheduler started (weekly, Sundays 3:00 AM)')
}
