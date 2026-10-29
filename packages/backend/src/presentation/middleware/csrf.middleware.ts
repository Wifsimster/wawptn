import type { Request, Response, NextFunction } from 'express'
import { env } from '../../config/env.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  const origin = req.headers.origin
  const referer = req.headers.referer
  const expected = env.CORS_ORIGIN

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

  authLogger.warn(
    { path: req.path, method: req.method },
    'csrf: missing Origin and Referer on mutating request',
  )
  res.status(403).json({ error: 'csrf', message: 'Cross-site request blocked' })
}
