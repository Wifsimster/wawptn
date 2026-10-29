import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDb, dbResultQueue, dbCallCounts } = vi.hoisted(() => {
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

  const dbResultQueue = new Map<string, unknown[]>()
  const dbCallCounts = new Map<string, number>()

  function nextResult(table: string): unknown {
    const idx = dbCallCounts.get(table) ?? 0
    dbCallCounts.set(table, idx + 1)
    const arr = dbResultQueue.get(table)
    if (!arr || arr.length === 0) return undefined
    return arr[Math.min(idx, arr.length - 1)]
  }

  const mockRaw = (() => Promise.resolve()) as unknown

  const mockDb = Object.assign(
    (table: string) => chain(nextResult(table)),
    { raw: mockRaw },
  )

  return { mockDb, dbResultQueue, dbCallCounts }
})

vi.mock('@/infrastructure/database/connection.js', () => ({ db: mockDb }))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { updateStreak, getUserStreakSummary } from '../streaks.js'

const rawFn = vi.fn().mockResolvedValue(undefined)
;(mockDb as unknown as Record<string, unknown>).raw = rawFn

function setResult(table: string, ...values: unknown[]) {
  dbResultQueue.set(table, values)
}

describe('updateStreak', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawFn.mockResolvedValue(undefined)
    dbResultQueue.clear()
    dbCallCounts.clear()
  })

  it('should start streak at 1 for a first-time participant', async () => {
    setResult('voting_sessions', { id: 'prev-s1' })
    setResult('streaks', undefined)

    await updateStreak('user-1', 'group-1', 'session-1')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[0]).toBe('user-1')
    expect(params[1]).toBe('group-1')
    expect(params[2]).toBe(1)
    expect(params[3]).toBe(1)
    expect(params[4]).toBe('session-1')
  })

  it('should increment streak for consecutive participation', async () => {
    setResult('voting_sessions', { id: 'prev-s1' })
    setResult('streaks', {
      current_streak: 3,
      best_streak: 5,
      last_session_id: 'prev-s1',
    })

    await updateStreak('user-1', 'group-1', 'session-2')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[2]).toBe(4)
    expect(params[3]).toBe(5)
  })

  it('should update best_streak when current exceeds it', async () => {
    setResult('voting_sessions', { id: 'prev-s1' })
    setResult('streaks', {
      current_streak: 5,
      best_streak: 5,
      last_session_id: 'prev-s1',
    })

    await updateStreak('user-1', 'group-1', 'session-2')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[2]).toBe(6)
    expect(params[3]).toBe(6)
  })

  it('should reset streak to 1 when user missed a session', async () => {
    setResult('voting_sessions', { id: 'prev-s2' })
    setResult('streaks', {
      current_streak: 4,
      best_streak: 7,
      last_session_id: 'prev-s1',
    })

    await updateStreak('user-1', 'group-1', 'session-3')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[2]).toBe(1)
    expect(params[3]).toBe(7)
  })

  it('should be idempotent — skip if session already processed', async () => {
    setResult('voting_sessions', { id: 'prev-s1' })
    setResult('streaks', {
      current_streak: 3,
      best_streak: 5,
      last_session_id: 'session-1',
    })

    await updateStreak('user-1', 'group-1', 'session-1')

    expect(rawFn).not.toHaveBeenCalled()
  })

  it('should start at 1 when no previous session exists in the group', async () => {
    setResult('voting_sessions', undefined)
    setResult('streaks', undefined)

    await updateStreak('user-1', 'group-1', 'session-1')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[2]).toBe(1)
    expect(params[3]).toBe(1)
  })

  it('should reset streak when no previous session but user has old streak', async () => {
    setResult('voting_sessions', undefined)
    setResult('streaks', {
      current_streak: 5,
      best_streak: 10,
      last_session_id: 'old-session',
    })

    await updateStreak('user-1', 'group-1', 'session-1')

    expect(rawFn).toHaveBeenCalledOnce()
    const params = rawFn.mock.calls[0]![1] as unknown[]
    expect(params[2]).toBe(1)
    expect(params[3]).toBe(10)
  })
})

describe('getUserStreakSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rawFn.mockResolvedValue(undefined)
    dbResultQueue.clear()
    dbCallCounts.clear()
  })

  it('returns zeros when the user has no streak rows', async () => {
    setResult('streaks', [])

    const summary = await getUserStreakSummary('user-1')

    expect(summary).toEqual({ bestCurrent: 0, bestEver: 0, activeStreakGroups: 0 })
  })

  it('rolls up the best current and ever across multiple groups', async () => {
    setResult('streaks', [
      { current_streak: 3, best_streak: 5 },
      { current_streak: 7, best_streak: 7 },
      { current_streak: 1, best_streak: 12 },
    ])

    const summary = await getUserStreakSummary('user-1')

    expect(summary.bestCurrent).toBe(7)
    expect(summary.bestEver).toBe(12)
  })

  it('counts only groups with a current streak >= 2 as active', async () => {
    setResult('streaks', [
      { current_streak: 1, best_streak: 4 },
      { current_streak: 2, best_streak: 2 },
      { current_streak: 5, best_streak: 5 },
      { current_streak: 1, best_streak: 8 },
    ])

    const summary = await getUserStreakSummary('user-1')

    expect(summary.activeStreakGroups).toBe(2)
  })

  it('coerces string-like number columns from pg', async () => {
    setResult('streaks', [
      { current_streak: '4', best_streak: '9' },
    ])

    const summary = await getUserStreakSummary('user-1')

    expect(summary.bestCurrent).toBe(4)
    expect(summary.bestEver).toBe(9)
  })
})
