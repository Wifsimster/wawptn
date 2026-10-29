import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockKnex, dbResultQueue, dbCallCounts, lastArgs } = vi.hoisted(() => {
  function chain(
    resolveValue: unknown,
    callLog: Array<{ method: string; args: unknown[] }>,
  ): unknown {
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(resolveValue).then(res, rej)
        }
        return (...args: unknown[]) => {
          callLog.push({ method: prop, args })
          return proxy
        }
      },
      apply() {
        return proxy
      },
    })
    return proxy
  }

  const dbResultQueue = new Map<string, unknown[]>()
  const dbCallCounts = new Map<string, number>()
  const lastArgs = {
    table: null as string | null,
    calls: [] as Array<{ method: string; args: unknown[] }>,
  }

  function nextResult(table: string): unknown {
    const idx = dbCallCounts.get(table) ?? 0
    dbCallCounts.set(table, idx + 1)
    const arr = dbResultQueue.get(table)
    if (!arr || arr.length === 0) return undefined
    return arr[Math.min(idx, arr.length - 1)]
  }

  const mockKnex = Object.assign(
    (table: string) => {
      lastArgs.table = table
      lastArgs.calls = []
      return chain(nextResult(table), lastArgs.calls)
    },
    { raw: () => undefined },
  )

  return { mockKnex, dbResultQueue, dbCallCounts, lastArgs }
})

vi.mock('@/infrastructure/database/connection.js', () => ({ db: mockKnex }))

import { KnexGroupRepository } from '../../infrastructure/repositories/knex-group-repository.js'
import type { Knex } from 'knex'

function setResult(table: string, ...values: unknown[]) {
  dbResultQueue.set(table, values)
}

function makeRepo(): KnexGroupRepository {
  return new KnexGroupRepository(mockKnex as unknown as Knex)
}

describe('KnexGroupRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbResultQueue.clear()
    dbCallCounts.clear()
    lastArgs.table = null
    lastArgs.calls = []
  })

  it('findById calls knex("groups").where({ id }).first() and returns the row', async () => {
    const row = {
      id: 'group-1',
      name: 'Test Group',
      created_by: 'user-1',
      invite_token_hash: null,
      invite_expires_at: null,
      invite_max_uses: null,
      invite_use_count: null,
      common_game_threshold: null,
      discord_channel_id: null,
      discord_guild_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    }
    setResult('groups', row)

    const result = await makeRepo().findById('group-1')

    expect(result).toEqual(row)
    expect(lastArgs.table).toBe('groups')

    const methods = lastArgs.calls.map(c => c.method)
    expect(methods).toContain('where')
    expect(methods).toContain('first')

    const whereCall = lastArgs.calls.find(c => c.method === 'where')
    expect(whereCall?.args[0]).toEqual({ id: 'group-1' })
  })

  it('findById returns null when the row is not found', async () => {
    setResult('groups', undefined)

    const result = await makeRepo().findById('missing-group')

    expect(result).toBeNull()
    expect(lastArgs.table).toBe('groups')
  })
})
