import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories (which are hoisted)
// ---------------------------------------------------------------------------

const {
  mockDb,
  dbResults,
  dbCallCounts,
  postSessionCreatedMock,
  postSessionClosedMock,
  isBotClientEnabledMock,
  buildVoteSummaryMock,
  flushPendingMock,
} = vi.hoisted(() => {
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

  const dbResults = new Map<string, unknown[]>()
  const dbCallCounts = new Map<string, number>()

  function nextResult(table: string): unknown {
    const idx = dbCallCounts.get(table) ?? 0
    dbCallCounts.set(table, idx + 1)
    const arr = dbResults.get(table)
    if (!arr || arr.length === 0) return undefined
    return arr[Math.min(idx, arr.length - 1)]
  }

  const noop = () => {}
  const mockDb = Object.assign(
    (table: string) => chain(nextResult(table)),
    { fn: { now: () => 'NOW()' }, raw: noop },
  )

  return {
    mockDb,
    dbResults,
    dbCallCounts,
    postSessionCreatedMock: vi.fn(),
    postSessionClosedMock: vi.fn(),
    isBotClientEnabledMock: vi.fn(),
    buildVoteSummaryMock: vi.fn(),
    flushPendingMock: vi.fn(),
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

vi.mock('@/config/env.js', () => ({
  env: { CORS_ORIGIN: 'https://wawptn.test' },
}))

vi.mock('@/infrastructure/discord/bot-client.js', () => ({
  postSessionCreated: postSessionCreatedMock,
  postSessionClosed: postSessionClosedMock,
  isBotClientEnabled: isBotClientEnabledMock,
}))

vi.mock('@/infrastructure/discord/vote-summary.js', () => ({
  buildVoteSummary: buildVoteSummaryMock,
}))

vi.mock('@/infrastructure/discord/live-vote-updater.js', () => ({
  flushPending: flushPendingMock,
}))

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { notifySessionCreated } from '../notifier.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setDbResult(table: string, ...values: unknown[]) {
  dbResults.set(table, values)
}

const fetchMock = vi.fn()
// notifier posts webhooks via global fetch
globalThis.fetch = fetchMock as unknown as typeof fetch

const games = [
  { steamAppId: 730, gameName: 'Counter-Strike 2', headerImageUrl: 'https://img/730.jpg' },
  { steamAppId: 440, gameName: 'Team Fortress 2', headerImageUrl: 'https://img/440.jpg' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifySessionCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbResults.clear()
    dbCallCounts.clear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
    buildVoteSummaryMock.mockResolvedValue({ tallies: [], totalVoters: 0, breakdown: [] })
  })

  it('posts via bot when channel is linked and bot is enabled', async () => {
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: 'chan-123',
      discord_webhook_url: null,
    })
    setDbResult('voting_sessions', { display_name: 'Alice' })

    isBotClientEnabledMock.mockReturnValue(true)
    postSessionCreatedMock.mockResolvedValue({ messageId: 'msg-abc' })

    await notifySessionCreated('g1', 'sess-1', games)

    expect(postSessionCreatedMock).toHaveBeenCalledTimes(1)
    expect(postSessionCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        groupId: 'g1',
        groupName: 'Test Group',
        channelId: 'chan-123',
        creatorName: 'Alice',
      }),
    )
    // Webhook fallback MUST NOT fire when the bot successfully handled it.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to webhook when bot is disabled even if channel is linked', async () => {
    // Regression guard for the gap where a group with both a linked channel
    // AND a configured webhook received NO notification when the bot HTTP
    // URL was missing from the backend env.
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: 'chan-123',
      discord_webhook_url: 'https://discord.com/api/webhooks/xxx/yyy',
    })
    setDbResult('voting_sessions', { display_name: 'Bob' })

    isBotClientEnabledMock.mockReturnValue(false)

    await notifySessionCreated('g1', 'sess-1', games)

    expect(postSessionCreatedMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://discord.com/api/webhooks/xxx/yyy')
    const body = JSON.parse((init as { body: string }).body)
    expect(body.embeds[0].title).toContain('Nouvelle session de vote')
    expect(body.embeds[0].description).toContain('Counter-Strike 2')
    expect(body.embeds[0].url).toBe('https://wawptn.test/groups/g1/vote')
  })

  it('falls back to webhook when bot post fails (returns null)', async () => {
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: 'chan-123',
      discord_webhook_url: 'https://discord.com/api/webhooks/xxx/yyy',
    })
    setDbResult('voting_sessions', { display_name: 'Carol' })

    isBotClientEnabledMock.mockReturnValue(true)
    // Simulate bot HTTP failure — postSessionCreated swallows and returns null.
    postSessionCreatedMock.mockResolvedValue(null)

    await notifySessionCreated('g1', 'sess-1', games)

    expect(postSessionCreatedMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses only webhook when group has no linked channel', async () => {
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: null,
      discord_webhook_url: 'https://discord.com/api/webhooks/xxx/yyy',
    })
    setDbResult('voting_sessions', { display_name: 'Dave' })

    isBotClientEnabledMock.mockReturnValue(true)

    await notifySessionCreated('g1', 'sess-1', games)

    expect(postSessionCreatedMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is a silent no-op when neither channel nor webhook are configured', async () => {
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: null,
      discord_webhook_url: null,
    })
    setDbResult('voting_sessions', { display_name: 'Eve' })

    isBotClientEnabledMock.mockReturnValue(true)

    await notifySessionCreated('g1', 'sess-1', games)

    expect(postSessionCreatedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns silently when the group does not exist', async () => {
    setDbResult('groups', undefined)

    isBotClientEnabledMock.mockReturnValue(true)

    await notifySessionCreated('missing-group', 'sess-1', games)

    expect(postSessionCreatedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the notification (but does not throw) when channel is linked, bot is disabled, and no webhook is set', async () => {
    // Regression guard for the "still no Discord message" bug: a group
    // that only went through `/wawptn-setup` has discord_channel_id but
    // no webhook. If the backend is misconfigured so isBotClientEnabled()
    // returns false, notifySessionCreated used to silently do nothing.
    // It still has nothing to send, but it must not throw and must not
    // try to post anywhere.
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: 'chan-123',
      discord_webhook_url: null,
    })
    setDbResult('voting_sessions', { display_name: 'Frank' })

    isBotClientEnabledMock.mockReturnValue(false)

    await expect(notifySessionCreated('g1', 'sess-1', games)).resolves.toBeUndefined()

    expect(postSessionCreatedMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops the notification when channel is linked, bot enabled, bot fails, and no webhook is set', async () => {
    // Similar regression guard for the bot-enabled-but-unreachable case
    // (e.g. DISCORD_BOT_HTTP_URL points at a dead host). With no webhook
    // configured there's still no transport to fall back to, but the
    // function must return cleanly so the caller's .catch() doesn't fire.
    setDbResult('groups', {
      id: 'g1',
      name: 'Test Group',
      discord_channel_id: 'chan-123',
      discord_webhook_url: null,
    })
    setDbResult('voting_sessions', { display_name: 'Grace' })

    isBotClientEnabledMock.mockReturnValue(true)
    postSessionCreatedMock.mockResolvedValue(null)

    await expect(notifySessionCreated('g1', 'sess-1', games)).resolves.toBeUndefined()

    expect(postSessionCreatedMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
