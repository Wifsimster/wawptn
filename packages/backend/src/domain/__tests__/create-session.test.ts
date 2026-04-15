import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories (which are hoisted)
// ---------------------------------------------------------------------------

const {
  mockDb,
  trxResults,
  dbResults,
  trxCallCounts,
  dbCallCounts,
  computeCommonGamesMock,
  recordSessionEventMock,
} = vi.hoisted(() => {
  /**
   * Chainable mock mimicking a Knex query builder.
   * Every method returns the same proxy, and `await` resolves to `resolveValue`.
   * When `resolveValue` is itself a thenable (e.g. `Promise.reject(...)`) the
   * rejection propagates through, which is how we simulate a 23505 on insert.
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

  const trxResults = new Map<string, unknown[]>()
  const dbResults = new Map<string, unknown[]>()
  const trxCallCounts = new Map<string, number>()
  const dbCallCounts = new Map<string, number>()

  function nextResult(
    map: Map<string, unknown[]>,
    counts: Map<string, number>,
    table: string,
  ): unknown {
    const idx = counts.get(table) ?? 0
    counts.set(table, idx + 1)
    const arr = map.get(table)
    if (!arr || arr.length === 0) return undefined
    return arr[Math.min(idx, arr.length - 1)]
  }

  const noop = () => {}

  const mockDb = Object.assign(
    (table: string) => chain(nextResult(dbResults, dbCallCounts, table)),
    {
      transaction: async (cb: (trx: unknown) => Promise<unknown>) => {
        const trx = Object.assign(
          (table: string) => chain(nextResult(trxResults, trxCallCounts, table)),
          {
            fn: { now: () => 'NOW()' },
            raw: noop,
          },
        )
        return cb(trx)
      },
      raw: noop,
    },
  )

  return {
    mockDb,
    trxResults,
    dbResults,
    trxCallCounts,
    dbCallCounts,
    computeCommonGamesMock: vi.fn(),
    recordSessionEventMock: vi.fn(),
  }
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

vi.mock('@/infrastructure/database/common-games.js', () => ({
  computeCommonGames: computeCommonGamesMock,
}))

vi.mock('@/domain/session-audit-trail.js', () => ({
  recordSessionEvent: recordSessionEventMock,
}))

// Domain events are fire-and-forget; swallow listeners for the test.
vi.mock('@/domain/events/event-bus.js', () => ({
  domainEvents: { emit: () => {}, on: () => {}, removeAllListeners: () => {} },
}))

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { createVotingSession } from '../create-session.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setTrxResult(table: string, ...values: unknown[]) {
  trxResults.set(table, values)
}
function setDbResult(table: string, ...values: unknown[]) {
  dbResults.set(table, values)
}

const sampleGames = [
  { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://img/730.jpg' },
  { steamAppId: 440, gameName: 'Team Fortress 2', headerImageUrl: 'https://img/440.jpg' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createVotingSession — "one open session per group" enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trxResults.clear()
    dbResults.clear()
    trxCallCounts.clear()
    dbCallCounts.clear()
    computeCommonGamesMock.mockResolvedValue(sampleGames)
    recordSessionEventMock.mockResolvedValue(undefined)
  })

  function stageHappyPrechecks() {
    // group_members.pluck → valid members list
    setDbResult('group_members', ['u1', 'u2'])
    // groups.first → group row (no threshold override)
    setDbResult('groups', { common_game_threshold: null })
    // votes.select → no previous vote counts
    setDbResult('votes', [])
  }

  it('throws a 409 when the pre-check finds an existing open session', async () => {
    stageHappyPrechecks()
    // voting_sessions.first (pre-check inside trx) returns an existing row.
    setTrxResult('voting_sessions', { id: 'existing-session-id' })

    await expect(
      createVotingSession({ groupId: 'g1', createdBy: 'u1', participantIds: ['u1', 'u2'] }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'conflict',
      message: 'A voting session is already open',
    })

    // We bail out of the transaction before hitting the insert path.
    expect(recordSessionEventMock).not.toHaveBeenCalled()
  })

  it('translates Postgres 23505 unique_violation on the insert into the same 409 conflict', async () => {
    // This simulates the race window: pre-check finds no open session,
    // but between the SELECT and the INSERT a concurrent transaction
    // committed an open session for the same group, so the partial
    // unique index rejects our INSERT.
    stageHappyPrechecks()

    const uniqueViolation = Object.assign(
      new Error(
        'insert into "voting_sessions" - duplicate key value violates unique constraint "uniq_voting_sessions_one_open_per_group"',
      ),
      { code: '23505' },
    )

    // The first trx('voting_sessions') call is the FOR UPDATE pre-check
    // (resolves to undefined — no existing session). The second call is
    // the insert — rejects with 23505.
    setTrxResult('voting_sessions', undefined, Promise.reject(uniqueViolation))
    // Swallow the unhandled rejection warning emitted when Vitest sees
    // the rejected promise we staged above before the proxy consumes it.
    ;(trxResults.get('voting_sessions')![1] as Promise<unknown>).catch(() => {})

    await expect(
      createVotingSession({ groupId: 'g1', createdBy: 'u1', participantIds: ['u1', 'u2'] }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'conflict',
      message: 'A voting session is already open',
    })
  })

  it('re-throws non-unique-violation DB errors unchanged', async () => {
    // Defensive: a 23502 NOT NULL violation (or any other error) should
    // propagate as-is so we don't mask real bugs as spurious 409s.
    stageHappyPrechecks()

    const otherError = Object.assign(
      new Error('insert into "voting_sessions" - null value in column "created_by"'),
      { code: '23502' },
    )
    setTrxResult('voting_sessions', undefined, Promise.reject(otherError))
    ;(trxResults.get('voting_sessions')![1] as Promise<unknown>).catch(() => {})

    await expect(
      createVotingSession({ groupId: 'g1', createdBy: 'u1', participantIds: ['u1', 'u2'] }),
    ).rejects.toMatchObject({
      code: '23502',
    })
  })
})
