import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — values referenced inside vi.mock factories (which are hoisted
// above the imports). Centralised so tests can swap behaviours per case.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  /** Last raw SQL passed to trx.raw — lets us assert the lock query shape. */
  let lastRawCall: { sql: string; bindings?: unknown[] } | null = null

  /** What the next pg_try_advisory_xact_lock should return. Defaults to true
   *  so a "happy path" run proceeds; tests flip this to false to assert the
   *  skip path. */
  let lockGranted = true

  /** Spies for the lock-holding transaction lifecycle. */
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

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
}))

vi.mock('@/domain/admin-audit-log.js', () => ({
  recordSystemAction: vi.fn(),
}))

import { runReconciliation, stopSubscriptionReconciler } from '../subscription-reconciler.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    // The lock-holding transaction must commit so the pooled connection
    // returns to the pool — otherwise we leak connections per run.
    expect(hoisted.commit).toHaveBeenCalled()
  })

  it('skips the run when another replica holds the lock', async () => {
    hoisted.state.lockGranted = false
    await runReconciliation()
    // Lock-holding transaction is committed even on skip so we don't
    // hold an open transaction forever.
    expect(hoisted.commit).toHaveBeenCalledOnce()
    // Reconciliation work was not performed — only the lock probe ran.
    expect(hoisted.state.lastRawCall?.sql).toMatch(/pg_try_advisory_xact_lock/i)
  })

  it('blocks a second concurrent call on the same instance (in-memory guard)', async () => {
    // Hang the FIRST transaction's lock-acquire raw call so the second
    // runReconciliation lands while the first is mid-flight.
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
    // Yield once so the first call begins its IIFE and sets isRunning=true.
    await Promise.resolve()
    const secondPromise = runReconciliation()
    const second = await secondPromise

    // Second call short-circuits and never opens a transaction.
    expect(hoisted.transaction).toHaveBeenCalledTimes(1)
    // Health snapshot returns whatever the in-memory state is — what we
    // care about is that no extra transaction was opened.
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
        return { rows: [{ got: false }] } // skip path so reconcile* never runs
      }),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    }))

    const inflight = runReconciliation()
    let stopResolved = false
    const stop = stopSubscriptionReconciler().then(() => { stopResolved = true })

    // Yield a few microtasks so the in-flight pass has a chance to start
    // and currentRun gets registered.
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    expect(stopResolved).toBe(false)

    release()
    await stop
    await inflight
    expect(stopResolved).toBe(true)
  })
})
