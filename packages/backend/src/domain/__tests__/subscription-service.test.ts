import { describe, it, expect, vi } from 'vitest'

vi.mock('@/infrastructure/database/connection.js', () => ({ db: vi.fn() }))

import { isInPastDueGrace, PAST_DUE_GRACE_PERIOD_DAYS } from '../subscription-service.js'

const DAY_MS = 24 * 60 * 60 * 1000

describe('isInPastDueGrace', () => {
  const now = new Date('2026-09-22T12:00:00Z').getTime()

  it('keeps access inside the grace window after a failed renewal', () => {
    expect(isInPastDueGrace({ status: 'past_due', past_due_since: new Date(now - DAY_MS) }, now)).toBe(true)
  })

  it('ends access once the grace window has elapsed', () => {
    const since = new Date(now - PAST_DUE_GRACE_PERIOD_DAYS * DAY_MS - 1)
    expect(isInPastDueGrace({ status: 'past_due', past_due_since: since }, now)).toBe(false)
  })

  it('never applies without a past_due_since or outside past_due', () => {
    expect(isInPastDueGrace({ status: 'past_due', past_due_since: null }, now)).toBe(false)
    expect(isInPastDueGrace({ status: 'canceled', past_due_since: new Date(now) }, now)).toBe(false)
    expect(isInPastDueGrace(null, now)).toBe(false)
  })
})
