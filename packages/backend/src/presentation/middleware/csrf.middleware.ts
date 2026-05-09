import type { Request, Response, NextFunction } from 'express'
import { env } from '../../config/env.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

/**
 * CSRF defence by Origin / Referer matching.
 *
 * The session cookie is `sameSite: 'lax'`, which blocks cross-site form
 * POSTs from the top-level navigation but does NOT block cross-site
 * fetch/XHR with `credentials: 'include'` initiated from an attacker page —
 * lax was designed to ease login flows, not to be a CSRF cure-all.
 *
 * For state-changing requests we therefore additionally require the
 * Origin (or Referer fallback) header to match `env.CORS_ORIGIN`. The
 * legitimate frontend always sends it; an attacker page on a different
 * origin cannot forge it because browsers set it from the document origin.
 *
 * GET/HEAD/OPTIONS are exempt — they should be side-effect free anyway,
 * and exempting them keeps tooling like RSS readers or health probes
 * unaffected.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  const origin = req.headers.origin
  const referer = req.headers.referer
  const expected = env.CORS_ORIGIN

  // Origin is preferred — it's set by the browser on every cross-origin
  // fetch and cannot be spoofed by JS. Match it exactly.
  if (typeof origin === 'string' && origin.length > 0) {
    if (origin === expected) {
      next()
      return
    }
    authLogger.warn(
      { path: req.path, method: req.method, origin },
      'csrf: origin mismatch',
    )
    res.status(403).json({ error: 'csrf', message: 'Cross-site request blocked' })
    return
  }

  // Referer fallback — some legacy clients omit Origin. Match by URL prefix.
  if (typeof referer === 'string' && referer.length > 0) {
    if (referer === expected || referer.startsWith(expected + '/')) {
      next()
      return
    }
    authLogger.warn(
      { path: req.path, method: req.method, referer },
      'csrf: referer mismatch',
    )
    res.status(403).json({ error: 'csrf', message: 'Cross-site request blocked' })
    return
  }

  // Neither header present on a state-changing request — refuse. Browsers
  // always set at least one for XHR/fetch from a real page; absence
  // indicates a non-browser client or a stripped header.
  authLogger.warn(
    { path: req.path, method: req.method },
    'csrf: missing Origin and Referer on mutating request',
  )
  res.status(403).json({ error: 'csrf', message: 'Cross-site request blocked' })
}
