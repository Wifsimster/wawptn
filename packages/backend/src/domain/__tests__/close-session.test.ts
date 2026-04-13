import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories (which are hoisted)
// ---------------------------------------------------------------------------

const { mockDb, trxResults, dbResults, trxCallCounts, dbCallCounts } = vi.hoisted(() => {
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

  return { mockDb, trxResults, dbResults, trxCallCounts, dbCallCounts }
})

// Module-scope vi.fn for the socket emit (created after hoisted block)
const socketEmit = vi.fn()

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/infrastructure/database/connection.js', () => ({ db: mockDb }))

vi.mock('@/infrastructure/socket/socket.js', () => ({
  getIO: () => ({ to: () => ({ emit: socketEmit }) }),
}))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

vi.mock('@/infrastructure/discord/notifier.js', () => ({
  notifyVoteClosed: () => Promise.resolve(),
}))

vi.mock('@/infrastructure/notifications/notification-service.js', () => ({
  createNotification: () => Promise.resolve(),
}))

vi.mock('@/domain/challenges/challenge-service.js', () => ({
  evaluateChallenges: () => Promise.resolve(),
}))

vi.mock('@/domain/streaks.js', () => ({
  updateStreak: () => Promise.resolve(),
}))

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { closeSession } from '../close-session.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setTrxResult(table: string, ...values: unknown[]) {
  trxResults.set(table, values)
}
function setDbResult(table: string, ...values: unknown[]) {
  dbResults.set(table, values)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('closeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socketEmit.mockClear()
    trxResults.clear()
    dbResults.clear()
    trxCallCounts.clear()
    dbCallCounts.clear()
  })

  it('should return the correct winner when one game has the most votes', async () => {
    // Inside the transaction:
    // trx('voting_sessions') call #1 → .where().update() → 1 (row updated)
    // trx('votes') call #1 → tally results
    // trx('voting_session_games') → game info
    // trx('voting_sessions') call #2 → winner update → 1
    // trx('votes') call #2 → countDistinct → { count }
    setTrxResult('voting_sessions', 1, 1)
    setTrxResult('votes',
      [
        { steam_app_id: 730, yes_count: '5' },
        { steam_app_id: 440, yes_count: '3' },
      ],
      { count: '8' },
    )
    setTrxResult('voting_session_games', { game_name: 'Counter-Strike 2', game_id: 'game-cs2' })

    // Post-transaction queries
    setDbResult('groups', { name: 'Test Group' })
    setDbResult('voting_session_participants', ['user-1', 'user-2'])

    const result = await closeSession('session-1', 'group-1')

    expect(result).not.toBeNull()
    expect(result!.steamAppId).toBe(730)
    expect(result!.gameName).toBe('Counter-Strike 2')
    expect(result!.gameId).toBe('game-cs2')
    expect(result!.yesCount).toBe(5)
    expect(result!.totalVoters).toBe(8)
    expect(result!.headerImageUrl).toContain('730')
  })

  it('should pick a winner from tied games via random tie-break', async () => {
    const tiedVotes = [
      { steam_app_id: 730, yes_count: '4' },
      { steam_app_id: 440, yes_count: '4' },
    ]

    const randomSpy = vi.spyOn(Math, 'random')

    // random picks first (index 0)
    randomSpy.mockReturnValue(0)
    setTrxResult('voting_sessions', 1, 1)
    setTrxResult('votes', tiedVotes, { count: '6' })
    setTrxResult('voting_session_games', { game_name: 'Counter-Strike 2', game_id: 'cs2' })
    setDbResult('groups', { name: 'G' })
    setDbResult('voting_session_participants', [])

    const r1 = await closeSession('s1', 'g1')
    expect(r1).not.toBeNull()
    expect(r1!.steamAppId).toBe(730)

    // Reset for second call
    trxResults.clear()
    dbResults.clear()
    trxCallCounts.clear()
    dbCallCounts.clear()

    // random picks second (index 1)
    randomSpy.mockReturnValue(0.99)
    setTrxResult('voting_sessions', 1, 1)
    setTrxResult('votes', tiedVotes, { count: '6' })
    setTrxResult('voting_session_games', { game_name: 'Team Fortress 2', game_id: 'tf2' })
    setDbResult('groups', { name: 'G' })
    setDbResult('voting_session_participants', [])

    const r2 = await closeSession('s2', 'g1')
    expect(r2).not.toBeNull()
    expect(r2!.steamAppId).toBe(440)
    expect(r2!.gameName).toBe('Team Fortress 2')

    randomSpy.mockRestore()
  })

  it('should handle empty votes gracefully', async () => {
    setTrxResult('voting_sessions', 1, 1)
    setTrxResult('votes', [], { count: '0' })
    setDbResult('groups', { name: 'G' })
    setDbResult('voting_session_participants', [])

    const result = await closeSession('s1', 'g1')

    expect(result).not.toBeNull()
    expect(result!.steamAppId).toBe(0)
    expect(result!.gameName).toBe('Unknown')
    expect(result!.yesCount).toBe(0)
    expect(result!.totalVoters).toBe(0)
    expect(result!.headerImageUrl).toBeNull()
  })

  it('should return null when session is already closed', async () => {
    setTrxResult('voting_sessions', 0) // 0 rows updated

    const result = await closeSession('s1', 'g1')

    expect(result).toBeNull()
    expect(socketEmit).not.toHaveBeenCalled()
  })

  it('should emit vote:closed via Socket.io on success', async () => {
    setTrxResult('voting_sessions', 1, 1)
    setTrxResult('votes',
      [{ steam_app_id: 730, yes_count: '3' }],
      { count: '5' },
    )
    setTrxResult('voting_session_games', { game_name: 'CS2', game_id: 'cs2' })
    setDbResult('groups', { name: 'G' })
    setDbResult('voting_session_participants', [])

    await closeSession('s1', 'g1')

    expect(socketEmit).toHaveBeenCalledWith(
      'vote:closed',
      expect.objectContaining({
        sessionId: 's1',
        result: expect.objectContaining({ steamAppId: 730, gameName: 'CS2' }),
      }),
    )
  })
})
