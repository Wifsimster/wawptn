import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockDb, dbResultQueue, dbCallCounts } = vi.hoisted(() => {
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

  const dbResultQueue = new Map<string, unknown[]>()
  const dbCallCounts = new Map<string, number>()

  function nextResult(table: string): unknown {
    const idx = dbCallCounts.get(table) ?? 0
    dbCallCounts.set(table, idx + 1)
    const arr = dbResultQueue.get(table)
    if (!arr || arr.length === 0) return undefined
    return arr[Math.min(idx, arr.length - 1)]
  }

  const mockDb = Object.assign((table: string) => chain(nextResult(table)), {
    raw: (() => Promise.resolve()) as unknown,
  })

  return { mockDb, dbResultQueue, dbCallCounts }
})

vi.mock('@/infrastructure/database/connection.js', () => ({ db: mockDb }))

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  selectPersonaForGroup,
  invalidateGroupPersonaCache,
  hashCode,
} from '../persona-selection.js'

function setResult(table: string, ...values: unknown[]) {
  dbResultQueue.set(table, values)
}

// Two active personas, ordered by created_at asc (as the real query does).
const PERSONAS = [
  { id: 'p-a', name: 'A', embed_color: 1, intro_message: 'a', is_active: true, created_at: new Date('2026-01-01') },
  { id: 'p-b', name: 'B', embed_color: 2, intro_message: 'b', is_active: true, created_at: new Date('2026-01-02') },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectPersonaForGroup — time-boxed override expiry', () => {
  beforeEach(() => {
    dbResultQueue.clear()
    dbCallCounts.clear()
  })

  it('drops a group override the moment it expires, even within the same Paris day (cache must not hold it stale)', async () => {
    const groupId = 'grp-expiry'
    // Unique key per test → isolate the module-level cache.
    invalidateGroupPersonaCache(groupId)

    // Pick the persona the daily hash would land on for this group/date, then
    // override to the *other* one so the pick visibly changes after expiry.
    const dateStr = '2026-06-02'
    const hashed = PERSONAS[hashCode(`${dateStr}:${groupId}`) % PERSONAS.length]!
    const overrideId = hashed.id === 'p-a' ? 'p-b' : 'p-a'

    const expiry = new Date('2026-06-02T12:00:00Z')
    setResult('personas', PERSONAS)
    setResult('app_settings', []) // global defaults: rotation on, no override
    setResult('group_persona_settings', {
      rotation_enabled: null,
      disabled_personas: null,
      persona_override: overrideId,
      override_expires_at: expiry,
    })

    // Before expiry (08:00 UTC = 10:00 Paris) → override wins.
    const before = await selectPersonaForGroup(groupId, new Date('2026-06-02T08:00:00Z'))
    expect(before?.id).toBe(overrideId)

    // After expiry (18:00 UTC = 20:00 Paris, same Paris day) → rotation resumes.
    // The cache from the first call must be treated as stale here.
    const after = await selectPersonaForGroup(groupId, new Date('2026-06-02T18:00:00Z'))
    expect(after?.id).toBe(hashed.id)
    expect(after?.id).not.toBe(overrideId)
  })

  it('keeps serving a still-valid override from cache without recomputing', async () => {
    const groupId = 'grp-valid'
    invalidateGroupPersonaCache(groupId)

    const expiry = new Date('2026-06-02T23:00:00Z')
    setResult('personas', PERSONAS)
    setResult('app_settings', [])
    setResult('group_persona_settings', {
      rotation_enabled: null,
      disabled_personas: null,
      persona_override: 'p-b',
      override_expires_at: expiry,
    })

    const first = await selectPersonaForGroup(groupId, new Date('2026-06-02T08:00:00Z'))
    expect(first?.id).toBe('p-b')

    // A later read still inside the validity window returns the same override.
    const second = await selectPersonaForGroup(groupId, new Date('2026-06-02T12:00:00Z'))
    expect(second?.id).toBe('p-b')
  })
})
