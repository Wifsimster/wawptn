import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

// Stub env + logger before importing the SUT — env reads process.env at
// import time and the logger pulls in pino's env-dependent setup.
vi.mock('@/config/env.js', () => ({
  env: { CORS_ORIGIN: 'https://wawptn.test' },
}))

vi.mock('@/infrastructure/logger/logger.js', () => {
  const noop = () => {}
  const child = () => ({ info: noop, warn: noop, error: noop, debug: noop, child })
  return {
    logger: { info: noop, warn: noop, error: noop, debug: noop, child },
    authLogger: { info: noop, warn: noop, error: noop, debug: noop, child },
  }
})

import { requireSameOrigin } from '../csrf.middleware.js'

function makeReq(method: string, headers: Record<string, string> = {}): Request {
  return { method, path: '/api/test', headers } as unknown as Request
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(n: number) { this.statusCode = n; return this },
    json(b: unknown) { this.body = b; return this },
  }
  return res
}

describe('requireSameOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes through GET/HEAD/OPTIONS without checking headers', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = makeReq(method)
      const res = makeRes()
      const next = vi.fn()
      requireSameOrigin(req, res as unknown as Response, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.statusCode).toBe(0)
    }
  })

  it('allows POST when Origin matches CORS_ORIGIN exactly', () => {
    const req = makeReq('POST', { origin: 'https://wawptn.test' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('blocks POST when Origin is a different host', () => {
    const req = makeReq('POST', { origin: 'https://attacker.example' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ error: 'csrf' })
  })

  it('blocks POST when Origin is a subdomain or path variant', () => {
    // Subdomain attack: cookie with sameSite=lax + a wildcard Origin check
    // would allow a subdomain. Exact match means we reject.
    const req = makeReq('POST', { origin: 'https://attacker.wawptn.test' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('allows POST via Referer fallback when Origin is missing', () => {
    const req = makeReq('POST', { referer: 'https://wawptn.test/subscription' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('blocks POST when Referer is a different origin', () => {
    const req = makeReq('POST', { referer: 'https://attacker.example/x' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('blocks POST with neither Origin nor Referer (non-browser client)', () => {
    const req = makeReq('POST')
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it.each(['PATCH', 'PUT', 'DELETE'])('also enforces on %s', (method) => {
    const req = makeReq(method, { origin: 'https://attacker.example' })
    const res = makeRes()
    const next = vi.fn()
    requireSameOrigin(req, res as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })
})
