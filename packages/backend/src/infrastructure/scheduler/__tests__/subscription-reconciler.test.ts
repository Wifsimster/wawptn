import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => {
  let lastRawCall: { sql: string; bindings?: unknown[] } | null = null

  let lockGranted = true

  const commit = vi.fn(async () => {})
  const rollback = vi.fn(async () => {})

  const reconcileSubscriptions = vi.fn(async () => {})
  const repairOrphanCustomers = vi.fn(async () => {})
  const enforcePastDueGracePeriod = vi.fn(async () => 0)

  function makeTrx() {
    return {
      raw: vi.fn(async (sql: string, bindings?: unknown[]) => {
        lastRawCall = { sql, bindings }
        return { rows: [{ got: lockGranted }] }
      }),
      commit,
      rollback,
    }
  }

  const transaction = vi.fn(async () => makeTrx())

  return {
    state: {
      get lastRawCall() { return lastRawCall },
      set lockGranted(v: boolean) { lockGranted = v },
      get lockGranted() { return lockGranted },
    },
    commit,
    rollback,
    transaction,
    reconcileSubscriptions,
    repairOrphanCustomers,
    enforcePastDueGracePeriod,
  }
})

vi.mock('@/infrastructure/database/connection.js', () => ({
  db: {
    transaction: hoisted.transaction,
  },
}))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return {
    logger: { info: noop, warn: noop, error: noop, debug: noop, child },
  }
})

vi.mock('@/infrastructure/stripe/stripe-client.js', () => ({
  isStripeEnabled: () => true,
  getStripe: () => ({
    subscriptions: { list: vi.fn(() => ({ [Symbol.asyncIterator]: () => ({ next: () => ({ done: true, value: undefined }) }) })) },
  }),
}))

vi.mock('@/domain/subscription-service.js', () => ({
  invalidatePremiumCache: vi.fn(),
  PAST_DUE_GRACE_PERIOD_DAYS: 3,
}))

vi.mock('@/domain/admin-audit-log.js', () => ({
  recordSystemAction: vi.fn(),
}))

import { runReconciliation, stopSubscriptionReconciler } from '../subscription-reconciler.js'

describe('runReconciliation', () => {
  beforeEach(() => {
    hoisted.commit.mockClear()
    hoisted.rollback.mockClear()
    hoisted.transaction.mockClear()
    hoisted.state.lockGranted = true
  })

  it('uses pg_try_advisory_xact_lock to elect a single replica', async () => {
    await runReconciliation()
    const raw = hoisted.state.lastRawCall
    expect(raw?.sql).toMatch(/pg_try_advisory_xact_lock/i)
    expect(hoisted.commit).toHaveBeenCalled()
  })

  it('skips the run when another replica holds the lock', async () => {
    hoisted.state.lockGranted = false
    await runReconciliation()
    expect(hoisted.commit).toHaveBeenCalledOnce()
    expect(hoisted.state.lastRawCall?.sql).toMatch(/pg_try_advisory_xact_lock/i)
  })

  it('blocks a second concurrent call on the same instance (in-memory guard)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    hoisted.transaction.mockImplementationOnce(async () => ({
      raw: vi.fn(async () => {
        await gate
        return { rows: [{ got: true }] }
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    }))

    const first = runReconciliation()
    await Promise.resolve()
    const secondPromise = runReconciliation()
    const second = await secondPromise

    expect(hoisted.transaction).toHaveBeenCalledTimes(1)
    expect(second).toBeDefined()

    release()
    await first
  })

  it('exposes stopSubscriptionReconciler that awaits any in-flight pass', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    hoisted.transaction.mockImplementationOnce(async () => ({
      raw: vi.fn(async () => {
        await gate
        return { rows: [{ got: false }] }
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    }))

    const inflight = runReconciliation()
    let stopResolved = false
    const stop = stopSubscriptionReconciler().then(() => { stopResolved = true })

    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    expect(stopResolved).toBe(false)

    release()
    await stop
    await inflight
    expect(stopResolved).toBe(true)
  })
})
