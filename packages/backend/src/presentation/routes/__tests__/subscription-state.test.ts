import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => {
  const chainCalls: string[][] = []

  let firstSelectResult: unknown = null

  let updatePayload: Record<string, unknown> | null = null

  function chainable(): unknown {
    const calls: string[] = []
    let resolveValue: unknown = undefined
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop: string) {
        if (prop === 'then') {
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
import { applySubscriptionState, mapStripeStatus } from '../../../domain/stripe-event-handlers.js'

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
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'past_due', past_due_since: new Date('2026-05-01') }
    const sub = makeStripeSub({ status: 'past_due' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.past_due')

    expect(hoisted.updatePayload).toBeDefined()
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

    expect(recordSystemAction).toHaveBeenCalled()
    const args = recordSystemAction.mock.calls[0] as unknown as unknown[]
    expect(args?.[3]).toBe(hoisted.trx)
  })
})

describe('applySubscriptionState — non-current subscription', () => {
  beforeEach(() => {
    hoisted.resetUpdate()
    recordSystemAction.mockClear()
  })

  it('ignores a dead event for an older subscription (keeps the current paid one)', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'active', past_due_since: null, stripe_subscription_id: 'sub_new' }
    const sub = makeStripeSub({ status: 'incomplete_expired' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.update')

    expect(hoisted.updatePayload).toBeNull()
    expect(recordSystemAction).not.toHaveBeenCalled()
  })

  it('lets a live subscription take over a row that tracks another one', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'canceled', past_due_since: null, stripe_subscription_id: 'sub_old' }
    const sub = makeStripeSub({ status: 'active' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.update')

    expect(hoisted.updatePayload?.['stripe_subscription_id']).toBe('sub_123')
    expect(hoisted.updatePayload?.['tier']).toBe('premium')
  })
})

describe('mapStripeStatus', () => {
  it('maps incomplete to inactive so an unpaid first checkout gets no grace', () => {
    expect(mapStripeStatus(makeStripeSub({ status: 'incomplete' }))).toMatchObject({ tier: 'free', status: 'inactive' })
  })

  it('maps past_due and unpaid to past_due', () => {
    expect(mapStripeStatus(makeStripeSub({ status: 'past_due' })).status).toBe('past_due')
    expect(mapStripeStatus(makeStripeSub({ status: 'unpaid' })).status).toBe('past_due')
  })
})

describe('applySubscriptionState — grace window', () => {
  beforeEach(() => hoisted.resetUpdate())

  it('does not restart the grace window for a row already canceled after grace', async () => {
    hoisted.firstSelectResult = { user_id: 'user-1', status: 'canceled', past_due_since: null, stripe_subscription_id: 'sub_123' }
    const sub = makeStripeSub({ status: 'past_due' })
    await applySubscriptionState(hoisted.trx as never, sub, 'subscription.system.past_due')

    expect(hoisted.updatePayload?.['status']).toBe('past_due')
    expect(hoisted.updatePayload?.['past_due_since']).toBeNull()
  })
})
