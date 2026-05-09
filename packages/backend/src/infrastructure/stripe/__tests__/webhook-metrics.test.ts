import { describe, it, expect, beforeEach } from 'vitest'
import {
  incrementWebhookReceived,
  incrementSignatureFailure,
  incrementWebhookDuplicate,
  incrementWebhookSuccess,
  incrementWebhookFailure,
  getWebhookMetrics,
  _resetWebhookMetrics,
} from '../webhook-metrics.js'

describe('webhook-metrics', () => {
  beforeEach(() => {
    _resetWebhookMetrics()
  })

  it('tracks totals and per-type breakdowns', () => {
    incrementWebhookReceived()
    incrementWebhookReceived()
    incrementWebhookSuccess('customer.subscription.updated')
    incrementWebhookSuccess('customer.subscription.updated')
    incrementWebhookFailure('customer.subscription.updated')
    incrementWebhookFailure('charge.refunded')
    incrementWebhookDuplicate()
    incrementSignatureFailure()

    const m = getWebhookMetrics()
    expect(m.totalReceived).toBe(2)
    expect(m.successes).toBe(2)
    expect(m.processingFailures).toBe(2)
    expect(m.duplicates).toBe(1)
    expect(m.signatureFailures).toBe(1)
    expect(m.byType['customer.subscription.updated']).toEqual({ successes: 2, failures: 1 })
    expect(m.byType['charge.refunded']).toEqual({ successes: 0, failures: 1 })
  })

  it('records lastSuccessAt only on success', () => {
    expect(getWebhookMetrics().lastSuccessAt).toBeNull()
    incrementWebhookFailure('charge.refunded')
    expect(getWebhookMetrics().lastSuccessAt).toBeNull()
    incrementWebhookSuccess('charge.refunded')
    expect(getWebhookMetrics().lastSuccessAt).toBeInstanceOf(Date)
  })

  it('returns a snapshot — mutations to the returned object do not leak back', () => {
    incrementWebhookSuccess('a')
    const snap = getWebhookMetrics()
    snap.byType['a'] = { successes: 999, failures: 999 }
    snap.successes = 999
    const fresh = getWebhookMetrics()
    expect(fresh.successes).toBe(1)
    expect(fresh.byType['a']).toEqual({ successes: 1, failures: 0 })
  })
})
