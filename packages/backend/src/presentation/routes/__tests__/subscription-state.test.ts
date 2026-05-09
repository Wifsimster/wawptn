import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted shared state
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  /** Chained query log — the first chain assertion proof for FOR UPDATE. */
  const chainCalls: string[][] = []

  /** Resolves to whatever `local` row the SELECT … FOR UPDATE should return. */
  let firstSelectResult: unknown = null

  /** Captures the UPDATE payload so tests can inspect what was written. */
  let updatePayload: Record<string, unknown> | null = null

  function chainable(): unknown {
    const calls: string[] = []
    let resolveValue: unknown = undefined
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          // The first first() call returns firstSelectResult (the locked
          // SELECT). Subsequent ones get undefined.
          return (res: (v: unknown) => void) =>
            Promise.resolve(resolveValue).then(res)
        }
        return (...args: unknown[]) => {
          calls.push(prop)
          if (prop === 'first') {
            resolveValue = firstSelectResult
            firstSelectResult = null
          }
          if (prop === 'update') {
            updatePayload = args[0] as Record<string, unknown>
          }
          if (prop === 'forUpdate') {
            chainCalls.push([...calls])
          }
          return proxy
        }
      },
      apply() { return proxy },
    })
    return proxy
  }

  const trx = Object.assign(
    (_table: string) => chainable(),
    {
      fn: { now: () => 'NOW()' },
      raw: vi.fn(async () => ({ rows: [{}] })),
    },
  )

  return {
    trx,
    chainCalls,
    set firstSelectResult(v: unknown) { firstSelectResult = v },
    get updatePayload() { return updatePayload },
    resetUpdate: () => { updatePayload = null },
  }
})

// ---------------------------------------------------------------------------
// Module mocks (must precede the import of the SUT)
// ---------------------------------------------------------------------------

vi.mock('@/infrastructure/database/connection.js', () => ({
  db: { transaction: vi.fn() },
}))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return {
    logger: { info: noop, warn: noop, error: noop, debug: noop, child },
    authLogger: { info: noop, warn: noop, error: noop, debug: noop, child },
  }
})

vi.mock('@/infrastructure/stripe/stripe-client.js', () => ({
  getStripe: () => ({}),
  isStripeError: () => false,
  stripeErrorContext: () => ({}),
}))

vi.mock('@/config/env.js', () => ({ env: { CORS_ORIGIN: 'https://test', STRIPE_PRICE_ID: 'price_x' } }))

vi.mock('@/domain/subscription-service.js', () => ({
  invalidatePremiumCache: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({ recordSystemAction: vi.fn(async () => {}) }))
const recordSystemAction = auditMocks.recordSystemAction
vi.mock('@/domain/admin-audit-log.js', () => ({
  recordSystemAction: auditMocks.recordSystemAction,
}))

import type Stripe from 'stripe'
import { applySubscriptionState } from '../../../domain/stripe-event-handlers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStripeSub(overrides: Partial<{ status: string; metadata: Record<string, string>; cancel_at_period_end: boolean; customer: string }> = {}): Stripe.Subscription {
  return {
    id: 'sub_123',
    status: overrides.status ?? 'past_due',
    customer: overrides.customer ?? 'cus_456',
    cancel_at_period_end: overrides.cancel_at_period_end ?? false,
    metadata: { userId: 'user-1', ...(overrides.metadata ?? {}) },
    items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400 }] },
  } as unknown as Stripe.Subscription
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applySubscriptionState — past_due transition', () => {
  beforeEach(() => {
    hoisted.chainCalls.length = 0
    hoisted.resetUpdate()
    recordSystemAction.mockClear()
  })

  it('uses SELECT … FOR UPDATE on the local subscriptions row', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'active', past_due_since: null }
    const sub = makeStripeSub({ status: 'past_due' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.past_due')

    // Find a chain that includes both `where` and `forUpdate` — proves
    // the locked read is used so concurrent webhook deliveries can't
    // race the past_due_since transition detection.
    const locked = hoisted.chainCalls.some((c) => c.includes('forUpdate') && c.includes('where'))
    expect(locked).toBe(true)
  })

  it('sets past_due_since on the FIRST transition into past_due', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'active', past_due_since: null }
    const sub = makeStripeSub({ status: 'past_due' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.past_due')

    expect(hoisted.updatePayload).toBeDefined()
    expect(hoisted.updatePayload?.['status']).toBe('past_due')
    expect(hoisted.updatePayload?.['past_due_since']).toBeInstanceOf(Date)
  })

  it('does NOT bump past_due_since on a subsequent past_due update', async () => {
    // Row is already past_due — a dunning retry should not reset the
    // grace clock. The reviewer flagged this as the "B2 bug": resetting
    // past_due_since on every webhook re-extended the grace period.
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'past_due', past_due_since: new Date('2026-05-01') }
    const sub = makeStripeSub({ status: 'past_due' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.past_due')

    expect(hoisted.updatePayload).toBeDefined()
    // past_due_since should be omitted from the UPDATE payload (undefined
    // sentinel in the implementation), so the existing column value is
    // preserved.
    expect(hoisted.updatePayload).not.toHaveProperty('past_due_since')
  })

  it('clears past_due_since when status returns to active', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'past_due', past_due_since: new Date('2026-05-01') }
    const sub = makeStripeSub({ status: 'active' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.recovered')

    expect(hoisted.updatePayload?.['past_due_since']).toBeNull()
    expect(hoisted.updatePayload?.['status']).toBe('active')
  })

  it('writes the audit row through the same transaction', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'active', past_due_since: null }
    const sub = makeStripeSub({ status: 'active' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.update')

    // Last argument is the executor; should be the trx so the audit row
    // commits atomically with the state change.
    expect(recordSystemAction).toHaveBeenCalled()
    const args = recordSystemAction.mock.calls[0] as unknown as unknown[]
    expect(args?.[3]).toBe(hoisted.trx)
  })
})
