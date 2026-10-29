import cron from 'node-cron'
import { cleanupExpiredNotifications } from './notification-service.js'
import { logger } from '../logger/logger.js'

const cleanupLogger = logger.child({ module: 'notification-cleanup' })

export function startNotificationCleanup(): void {
  const runCleanup = async (): Promise<void> => {
    try {
      const deleted = await cleanupExpiredNotifications()
      cleanupLogger.info({ deleted }, 'notification cleanup completed')
    } catch (error) {
      cleanupLogger.error({ error: String(error) }, 'notification cleanup failed')
    }
  }

  cron.schedule('0 3 * * 0', runCleanup)

  setTimeout(() => { void runCleanup() }, 30_000)

  cleanupLogger.info('notification cleanup scheduler started (weekly Sundays 3:00 AM, catch-up on startup)')
}
