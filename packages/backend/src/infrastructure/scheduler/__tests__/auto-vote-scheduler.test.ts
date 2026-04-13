import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories (which are hoisted)
// ---------------------------------------------------------------------------

const { mockDb, dbResults, dbCallCounts, scheduledCallbacks, createVotingSessionMock } =
  vi.hoisted(() => {
    /**
     * Chainable mock mimicking a Knex query builder.
     * Every method returns the same proxy, and `await` resolves to `resolveValue`.
     */
    function chain(resolveValue: unknown = undefined): unknown {
      const proxy: unknown = new Proxy(() => {}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
              Promise.resolve(resolveValue).then(res, rej)
          }
          return (..._a: unknown[]) => proxy
        },
        apply() {
          return proxy
        },
      })
      return proxy
    }

    const dbResults = new Map<string, unknown[]>()
    const dbCallCounts = new Map<string, number>()

    function nextResult(table: string): unknown {
      const idx = dbCallCounts.get(table) ?? 0
      dbCallCounts.set(table, idx + 1)
      const arr = dbResults.get(table)
      if (!arr || arr.length === 0) return undefined
      return arr[Math.min(idx, arr.length - 1)]
    }

    const noop = () => {}
    const mockDb = Object.assign(
      (table: string) => chain(nextResult(table)),
      { fn: { now: () => 'NOW()' }, raw: noop },
    )

    // Records cron callbacks so tests can fire them manually.
    const scheduledCallbacks: Array<() => Promise<void> | void> = []
    const createVotingSessionMock = vi.fn()

    return { mockDb, dbResults, dbCallCounts, scheduledCallbacks, createVotingSessionMock }
  })

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/infrastructure/database/connection.js', () => ({ db: mockDb }))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

vi.mock('@/domain/create-session.js', () => ({
  createVotingSession: createVotingSessionMock,
}))

vi.mock('node-cron', () => {
  const stop = vi.fn()
  return {
    default: {
      validate: () => true,
      schedule: (_expr: string, cb: () => Promise<void> | void) => {
        scheduledCallbacks.push(cb)
        return { stop }
      },
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setDbResult(table: string, ...values: unknown[]) {
  dbResults.set(table, values)
}

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { updateGroupSchedule } from '../auto-vote-scheduler.js'

describe('auto-vote-scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbResults.clear()
    dbCallCounts.clear()
    scheduledCallbacks.length = 0
    createVotingSessionMock.mockReset()
  })

  it('persists the auto-close target on the session row so it survives a restart', async () => {
    // Arrange — the cron tick reads members, then existing open session,
    // then the group owner. Configure the mock db results in that order.
    setDbResult('group_members', ['user-a', 'user-b', 'user-c']) // member ids
    setDbResult('voting_sessions', undefined) // no existing open session
    // Owner lookup: a single row
    dbResults.set('group_members', ['user-a', 'user-b', 'user-c']) // memberIds.pluck()
    // The second call to db('group_members') is the owner lookup; we override
    // by sequencing two distinct results for the same table.
    dbResults.set('group_members', [
      ['user-a', 'user-b', 'user-c'], // first call: pluck() returns array
      { user_id: 'user-a' }, // second call: .first() returns owner row
    ])

    createVotingSessionMock.mockResolvedValue({
      session: { id: 'session-1' },
      games: [],
    })

    // Pin the clock so we can assert the close target deterministically.
    const fixedNow = new Date('2026-04-13T20:00:00.000Z').getTime()
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    // Act — register a schedule (registers a cron callback in our mock),
    // then fire that callback as if the cron had ticked.
    updateGroupSchedule('group-1', '0 21 * * 5', 90)
    expect(scheduledCallbacks.length).toBe(1)
    const tick = scheduledCallbacks[0]
    expect(tick).toBeDefined()
    await tick!()

    // Assert — createVotingSession received scheduledAt = now + 90 minutes.
    expect(createVotingSessionMock).toHaveBeenCalledTimes(1)
    const call = createVotingSessionMock.mock.calls[0]?.[0] as {
      scheduledAt?: Date
      groupId: string
      createdBy: string
      participantIds: string[]
    }
    expect(call.groupId).toBe('group-1')
    expect(call.createdBy).toBe('user-a')
    expect(call.participantIds).toEqual(['user-a', 'user-b', 'user-c'])
    expect(call.scheduledAt).toBeInstanceOf(Date)
    expect(call.scheduledAt?.getTime()).toBe(fixedNow + 90 * 60 * 1000)
  })

  it('skips when the group has fewer than 2 members', async () => {
    setDbResult('group_members', ['user-a'])

    updateGroupSchedule('group-2', '0 21 * * 5', 60)
    const tick = scheduledCallbacks[0]
    await tick!()

    expect(createVotingSessionMock).not.toHaveBeenCalled()
  })

  it('skips when an open session already exists', async () => {
    dbResults.set('group_members', [['user-a', 'user-b']])
    setDbResult('voting_sessions', { id: 'existing-session' })

    updateGroupSchedule('group-3', '0 21 * * 5', 60)
    const tick = scheduledCallbacks[0]
    await tick!()

    expect(createVotingSessionMock).not.toHaveBeenCalled()
  })
})
