import cron, { type ScheduledTask } from 'node-cron'
import { db } from '../database/connection.js'
import { runReleasesDigestForGroup } from '../../domain/releases-digest.js'
import { logger } from '../logger/logger.js'

const schedulerLogger = logger.child({ module: 'releases-digest-scheduler' })

const DIGEST_TIMEZONE = 'Europe/Paris'

const scheduledTasks = new Map<string, ScheduledTask>()

interface GroupDigestSchedule {
  id: string
  releases_digest_schedule: string
}

function scheduleGroupDigest(group: GroupDigestSchedule): void {
  const existing = scheduledTasks.get(group.id)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(group.id)
  }

  if (!group.releases_digest_schedule || !cron.validate(group.releases_digest_schedule)) {
    return
  }

  const task = cron.schedule(
    group.releases_digest_schedule,
    async () => {
      schedulerLogger.info({ groupId: group.id, schedule: group.releases_digest_schedule }, 'releases digest triggered')
      try {
        await runReleasesDigestForGroup(group.id)
      } catch (err) {
        schedulerLogger.error({ error: String(err), groupId: group.id }, 'releases digest run failed')
      }
    },
    { timezone: DIGEST_TIMEZONE },
  )

  scheduledTasks.set(group.id, task)
  schedulerLogger.info({ groupId: group.id, schedule: group.releases_digest_schedule }, 'releases digest scheduled')
}

async function syncSchedules(): Promise<void> {
  try {
    const groups: GroupDigestSchedule[] = await db('groups')
      .where({ releases_digest_enabled: true })
      .select('id', 'releases_digest_schedule')

    const activeGroupIds = new Set(groups.map((g) => g.id))

    for (const [groupId, task] of scheduledTasks) {
      if (!activeGroupIds.has(groupId)) {
        task.stop()
        scheduledTasks.delete(groupId)
        schedulerLogger.info({ groupId }, 'releases digest unscheduled (disabled)')
      }
    }

    for (const group of groups) {
      scheduleGroupDigest(group)
    }

    schedulerLogger.info({ activeGroups: groups.length }, 'releases digest schedules synced')
  } catch (err) {
    schedulerLogger.error({ error: String(err) }, 'failed to sync releases digest schedules')
  }
}

export function startReleasesDigestScheduler(): void {
  syncSchedules()

  cron.schedule('*/5 * * * *', () => {
    syncSchedules()
  })

  schedulerLogger.info('releases digest scheduler started (syncing every 5 minutes)')
}

export function updateGroupDigestSchedule(groupId: string, enabled: boolean, schedule: string): void {
  if (!enabled) {
    const existing = scheduledTasks.get(groupId)
    if (existing) {
      existing.stop()
      scheduledTasks.delete(groupId)
    }
    schedulerLogger.info({ groupId }, 'releases digest unscheduled')
    return
  }

  scheduleGroupDigest({ id: groupId, releases_digest_schedule: schedule })
}
