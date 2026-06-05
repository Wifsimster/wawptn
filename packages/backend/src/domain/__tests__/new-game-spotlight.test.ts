import { describe, it, expect } from 'vitest'

// new-game-spotlight.ts pulls in the DB connection, the session creator and
// the Discord notifier at import time. The function under test here is pure,
// so those side-effecting modules are stubbed out.
import { vi } from 'vitest'
vi.mock('@/infrastructure/database/connection.js', () => ({ db: {} }))
vi.mock('@/domain/create-session.js', () => ({ createVotingSession: vi.fn() }))
vi.mock('@/infrastructure/discord/spotlight-notifier.js', () => ({ notifyNewGameSpotlight: vi.fn() }))
vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { diffNewlyAcquired, MAX_SPOTLIGHT_GAMES_PER_RUN } from '../new-game-spotlight.js'

describe('diffNewlyAcquired', () => {
  it('returns only app IDs not already owned', () => {
    const existing = new Set([1, 2, 3])
    expect(diffNewlyAcquired(existing, [2, 3, 4, 5])).toEqual([4, 5])
  })

  it('returns nothing when every synced game is already owned', () => {
    const existing = new Set([10, 20])
    expect(diffNewlyAcquired(existing, [10, 20])).toEqual([])
  })

  it('treats an empty existing library as "everything is new"', () => {
    // The caller is responsible for suppressing spotlights on a first sync;
    // the diff itself just reports the set difference.
    expect(diffNewlyAcquired(new Set(), [7, 8])).toEqual([7, 8])
  })

  it('preserves order of the synced list', () => {
    expect(diffNewlyAcquired(new Set([1]), [5, 1, 3, 2])).toEqual([5, 3, 2])
  })
})

describe('MAX_SPOTLIGHT_GAMES_PER_RUN', () => {
  it('does not exceed the bot button cap of 10', () => {
    expect(MAX_SPOTLIGHT_GAMES_PER_RUN).toBeLessThanOrEqual(10)
  })
})
