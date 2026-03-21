import cron, { type ScheduledTask } from 'node-cron'
import { db } from '../database/connection.js'
import { createVotingSession } from '../../domain/create-session.js'
import { closeSession } from '../../domain/close-session.js'
import { logger } from '../logger/logger.js'

const schedulerLogger = logger.child({ module: 'auto-vote-scheduler' })

/** Map of group ID -> scheduled cron task */
const scheduledTasks = new Map<string, ScheduledTask>()

/** Map of group ID -> auto-close timeout */
const autoCloseTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

interface GroupSchedule {
  id: string
  auto_vote_schedule: string
  auto_vote_duration_minutes: number
}

/**
 * Schedule a cron job for a single group's auto-vote.
 */
function scheduleGroupAutoVote(group: GroupSchedule): void {
  // Stop existing task if any
  const existing = scheduledTasks.get(group.id)
  if (existing) {
    existing.stop()
    scheduledTasks.delete(group.id)
  }

  const existingTimeout = autoCloseTimeouts.get(group.id)
  if (existingTimeout) {
    clearTimeout(existingTimeout)
    autoCloseTimeouts.delete(group.id)
  }

  if (!group.auto_vote_schedule || !cron.validate(group.auto_vote_schedule)) {
    return
  }

  const task = cron.schedule(group.auto_vote_schedule, async () => {
    try {
      schedulerLogger.info({ groupId: group.id, schedule: group.auto_vote_schedule }, 'auto-vote triggered')

      // Get all group member IDs
      const memberIds: string[] = await db('group_members')
        .where({ group_id: group.id })
        .pluck('user_id')

      if (memberIds.length < 2) {
        schedulerLogger.warn({ groupId: group.id, memberCount: memberIds.length }, 'auto-vote skipped: not enough members')
        return
      }

      // Check if there's already an open session
      const existingSession = await db('voting_sessions')
        .where({ group_id: group.id, status: 'open' })
        .first()

      if (existingSession) {
        schedulerLogger.warn({ groupId: group.id, sessionId: existingSession.id }, 'auto-vote skipped: session already open')
        return
      }

      // Get the group owner as session creator
      const owner = await db('group_members')
        .where({ group_id: group.id, role: 'owner' })
        .first()

      if (!owner) {
        schedulerLogger.warn({ groupId: group.id }, 'auto-vote skipped: no group owner found')
        return
      }

      const result = await createVotingSession({
        groupId: group.id,
        createdBy: owner.user_id,
        participantIds: memberIds,
      })

      schedulerLogger.info(
        { groupId: group.id, sessionId: result.session.id, gameCount: result.games.length },
        'auto-vote session created'
      )

      // Schedule auto-close after the configured duration
      const durationMs = (group.auto_vote_duration_minutes || 120) * 60 * 1000
      const timeout = setTimeout(async () => {
        try {
          autoCloseTimeouts.delete(group.id)
          const session = await db('voting_sessions')
            .where({ id: result.session.id, status: 'open' })
            .first()

          if (session) {
            await closeSession(result.session.id, group.id)
            schedulerLogger.info(
              { groupId: group.id, sessionId: result.session.id },
              'auto-vote session auto-closed after duration'
            )
          }
        } catch (err) {
          schedulerLogger.error({ error: String(err), groupId: group.id }, 'auto-close failed')
        }
      }, durationMs)

      autoCloseTimeouts.set(group.id, timeout)
    } catch (err) {
      schedulerLogger.error({ error: String(err), groupId: group.id }, 'auto-vote session creation failed')
    }
  })

  scheduledTasks.set(group.id, task)
  schedulerLogger.info({ groupId: group.id, schedule: group.auto_vote_schedule }, 'auto-vote scheduled')
}

/**
 * Load all groups with auto-vote schedules and sync the cron tasks.
 */
async function syncSchedules(): Promise<void> {
  try {
    const groups: GroupSchedule[] = await db('groups')
      .whereNotNull('auto_vote_schedule')
      .select('id', 'auto_vote_schedule', 'auto_vote_duration_minutes')

    const activeGroupIds = new Set(groups.map(g => g.id))

    // Stop tasks for groups that no longer have a schedule
    for (const [groupId, task] of scheduledTasks) {
      if (!activeGroupIds.has(groupId)) {
        task.stop()
        scheduledTasks.delete(groupId)
        const timeout = autoCloseTimeouts.get(groupId)
        if (timeout) {
          clearTimeout(timeout)
          autoCloseTimeouts.delete(groupId)
        }
        schedulerLogger.info({ groupId }, 'auto-vote unscheduled (schedule removed)')
      }
    }

    // Schedule or update tasks for active groups
    for (const group of groups) {
      scheduleGroupAutoVote(group)
    }

    schedulerLogger.info({ activeGroups: groups.length }, 'auto-vote schedules synced')
  } catch (err) {
    schedulerLogger.error({ error: String(err) }, 'failed to sync auto-vote schedules')
  }
}

/**
 * Start the auto-vote scheduler.
 * Loads schedules on startup and re-checks every 5 minutes for changes.
 */
export function startAutoVoteScheduler(): void {
  // Initial load
  syncSchedules()

  // Re-sync every 5 minutes to pick up schedule changes
  cron.schedule('*/5 * * * *', () => {
    syncSchedules()
  })

  schedulerLogger.info('auto-vote scheduler started (syncing every 5 minutes)')
}

/**
 * Update the schedule for a specific group immediately (called after PATCH).
 * This avoids waiting for the 5-minute sync interval.
 */
export function updateGroupSchedule(groupId: string, schedule: string | null, durationMinutes: number): void {
  if (!schedule) {
    // Remove the task
    const existing = scheduledTasks.get(groupId)
    if (existing) {
      existing.stop()
      scheduledTasks.delete(groupId)
    }
    const timeout = autoCloseTimeouts.get(groupId)
    if (timeout) {
      clearTimeout(timeout)
      autoCloseTimeouts.delete(groupId)
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
