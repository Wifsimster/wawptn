import cron, { type ScheduledTask } from 'node-cron'
import { db } from '../database/connection.js'
import { createVotingSession } from '../../domain/create-session.js'
import { isUserPremium } from '../../domain/subscription-service.js'
import { logger } from '../logger/logger.js'

const schedulerLogger = logger.child({ module: 'auto-vote-scheduler' })

const scheduledTasks = new Map<string, ScheduledTask>()

interface GroupSchedule {
  id: string
  auto_vote_schedule: string
  auto_vote_duration_minutes: number
}

function scheduleGroupAutoVote(group: GroupSchedule): void {
  const existing = scheduledTasks.get(group.id)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(group.id)
  }

  if (!group.auto_vote_schedule || !cron.validate(group.auto_vote_schedule)) {
    return
  }

  const task = cron.schedule(group.auto_vote_schedule, async () => {
    try {
      schedulerLogger.info({ groupId: group.id, schedule: group.auto_vote_schedule }, 'auto-vote triggered')

      const memberIds: string[] = await db('group_members')
        .where({ group_id: group.id })
        .pluck('user_id')

      if (memberIds.length < 2) {
        schedulerLogger.warn({ groupId: group.id, memberCount: memberIds.length }, 'auto-vote skipped: not enough members')
        return
      }

      const existingSession = await db('voting_sessions')
        .where({ group_id: group.id, status: 'open' })
        .first()

      if (existingSession) {
        schedulerLogger.warn({ groupId: group.id, sessionId: existingSession.id }, 'auto-vote skipped: session already open')
        return
      }

      const owner = await db('group_members')
        .where({ group_id: group.id, role: 'owner' })
        .first()

      if (!owner) {
        schedulerLogger.warn({ groupId: group.id }, 'auto-vote skipped: no group owner found')
        return
      }

      if (!(await isUserPremium(owner.user_id))) {
        schedulerLogger.info({ groupId: group.id, ownerId: owner.user_id }, 'auto-vote skipped: owner is no longer premium')
        return
      }

      const durationMinutes = group.auto_vote_duration_minutes || 120
      const closeAt = new Date(Date.now() + durationMinutes * 60 * 1000)

      const result = await createVotingSession({
        groupId: group.id,
        createdBy: owner.user_id,
        participantIds: memberIds,
        scheduledAt: closeAt,
      })

      schedulerLogger.info(
        {
          groupId: group.id,
          sessionId: result.session.id,
          gameCount: result.games.length,
          durationMinutes,
          closeAt: closeAt.toISOString(),
        },
        'auto-vote session created'
      )
    } catch (err) {
      schedulerLogger.error({ error: String(err), groupId: group.id }, 'auto-vote session creation failed')
    }
  })

  scheduledTasks.set(group.id, task)
  schedulerLogger.info({ groupId: group.id, schedule: group.auto_vote_schedule }, 'auto-vote scheduled')
}

async function syncSchedules(): Promise<void> {
  try {
    const groups: GroupSchedule[] = await db('groups')
      .whereNotNull('auto_vote_schedule')
      .select('id', 'auto_vote_schedule', 'auto_vote_duration_minutes')

    const activeGroupIds = new Set(groups.map(g => g.id))

    for (const [groupId, task] of scheduledTasks) {
      if (!activeGroupIds.has(groupId)) {
        task.stop()
        scheduledTasks.delete(groupId)
        schedulerLogger.info({ groupId }, 'auto-vote unscheduled (schedule removed)')
      }
    }

    for (const group of groups) {
      scheduleGroupAutoVote(group)
    }

    schedulerLogger.info({ activeGroups: groups.length }, 'auto-vote schedules synced')
  } catch (err) {
    schedulerLogger.error({ error: String(err) }, 'failed to sync auto-vote schedules')
  }
}

export function startAutoVoteScheduler(): void {
  syncSchedules()

  cron.schedule('*/5 * * * *', () => {
    syncSchedules()
  })

  schedulerLogger.info('auto-vote scheduler started (syncing every 5 minutes)')
}

export function updateGroupSchedule(groupId: string, schedule: string | null, durationMinutes: number): void {
  if (!schedule) {
    const existing = scheduledTasks.get(groupId)
    if (existing) {
      existing.stop()
      scheduledTasks.delete(groupId)
    }
    schedulerLogger.info({ groupId }, 'auto-vote unscheduled')
    return
  }

  scheduleGroupAutoVote({
    id: groupId,
    auto_vote_schedule: schedule,
    auto_vote_duration_minutes: durationMinutes,
  })
}
