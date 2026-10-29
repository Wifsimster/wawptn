import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDb,
  trxResults,
  dbResults,
  trxCallCounts,
  dbCallCounts,
  computeCommonGamesMock,
  recordSessionEventMock,
} = vi.hoisted(() => {
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

vi.mock('@/domain/events/event-bus.js', () => ({
  domainEvents: { emit: () => {}, on: () => {}, removeAllListeners: () => {} },
}))

import { createVotingSession } from '../create-session.js'

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
    setDbResult('group_members', ['u1', 'u2'])
    setDbResult('groups', { common_game_threshold: null })
    setDbResult('votes', [])
  }

  it('throws a 409 when the pre-check finds an existing open session', async () => {
    stageHappyPrechecks()
    setTrxResult('voting_sessions', { id: 'existing-session-id' })

    await expect(
      createVotingSession({ groupId: 'g1', createdBy: 'u1', participantIds: ['u1', 'u2'] }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'conflict',
      message: 'A voting session is already open',
    })

    expect(recordSessionEventMock).not.toHaveBeenCalled()
  })

  it('translates Postgres 23505 unique_violation on the insert into the same 409 conflict', async () => {
    stageHappyPrechecks()

    const uniqueViolation = Object.assign(
      new Error(
        'insert into "voting_sessions" - duplicate key value violates unique constraint "uniq_voting_sessions_one_open_per_group"',
      ),
      { code: '23505' },
    )

    setTrxResult('voting_sessions', undefined, Promise.reject(uniqueViolation))
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
