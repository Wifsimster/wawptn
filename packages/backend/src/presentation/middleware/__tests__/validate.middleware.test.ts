import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

// Mock the logger before importing the module under test so the import
// graph doesn't pull in the real pino logger and its env-dependent setup.
vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return { logger: { info: noop, warn: noop, error: noop, debug: noop, child } }
})

import { validateBody, validateQuery } from '../validate.middleware.js'

function mockRes() {
  const res: {
    statusCode: number
    body: unknown
    status: (n: number) => typeof res
    json: (b: unknown) => typeof res
  } = {
    statusCode: 200,
    body: undefined,
    status(n: number) {
      this.statusCode = n
      return this
    },
    json(b: unknown) {
      this.body = b
      return this
    },
  }
  return res
}

describe('validateBody', () => {
  const Schema = z.object({
    name: z.string().min(1),
    count: z.number().int().min(0),
  })

  it('calls next() and replaces req.body with the parsed value on success', () => {
    const middleware = validateBody(Schema)
    const req = { path: '/test', body: { name: 'Alice', count: 3 } }
    const res = mockRes()
    const next = vi.fn()

    middleware(req as unknown as Parameters<typeof middleware>[0], res as unknown as Parameters<typeof middleware>[1], next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBe(200)
    expect(req.body).toEqual({ name: 'Alice', count: 3 })
  })

  it('returns 400 with a structured issue list when validation fails', () => {
    const middleware = validateBody(Schema)
    const req = { path: '/test', body: { name: '', count: -1 } }
    const res = mockRes()
    const next = vi.fn()

    middleware(req as unknown as Parameters<typeof middleware>[0], res as unknown as Parameters<typeof middleware>[1], next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    const body = res.body as { error: string; issues: Array<{ path: string }> }
    expect(body.error).toBe('validation')
    expect(body.issues.length).toBeGreaterThanOrEqual(2)
    expect(body.issues.map((i) => i.path).sort()).toEqual(['count', 'name'])
  })

  it('reports (root) for path-less issues', () => {
    const middleware = validateBody(z.string())
    const req = { path: '/test', body: 42 }
    const res = mockRes()
    const next = vi.fn()

    middleware(req as unknown as Parameters<typeof middleware>[0], res as unknown as Parameters<typeof middleware>[1], next)

    expect(res.statusCode).toBe(400)
    const body = res.body as { issues: Array<{ path: string }> }
    expect(body.issues[0]?.path).toBe('(root)')
  })
})

describe('validateQuery', () => {
  const Schema = z.object({
    limit: z.coerce.number().int().min(1).max(100),
  })

  it('attaches parsed query to req.validatedQuery on success', () => {
    const middleware = validateQuery(Schema)
    const req = { path: '/test', query: { limit: '25' } } as unknown as {
      validatedQuery?: unknown
    }
    const res = mockRes()
    const next = vi.fn()

    middleware(req as unknown as Parameters<typeof middleware>[0], res as unknown as Parameters<typeof middleware>[1], next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.validatedQuery).toEqual({ limit: 25 })
  })

  it('returns 400 when query validation fails', () => {
    const middleware = validateQuery(Schema)
    const req = { path: '/test', query: { limit: 'nope' } }
    const res = mockRes()
    const next = vi.fn()

    middleware(req as unknown as Parameters<typeof middleware>[0], res as unknown as Parameters<typeof middleware>[1], next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    const body = res.body as { error: string; issues: unknown[] }
    expect(body.error).toBe('validation')
    expect(body.issues.length).toBe(1)
  })
})
