import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()
const statsLogger = logger.child({ module: 'stats' })

/** Lightweight cache so the LandingPage social-proof strip doesn't run
 *  three COUNT(*) queries per page load. The numbers move slowly; one
 *  refresh per 5 minutes is plenty for a marketing surface. */
let cache: { value: PublicStats; expiresAt: number } | null = null
const TTL_MS = 5 * 60_000

interface PublicStats {
  /** Total registered users — proxy for "join X gamers". */
  users: number
  /** Total groups created — proxy for "Y groupes décident ensemble". */
  groups: number
  /** Closed voting sessions, all-time — proxy for "Z parties choisies". */
  votesClosed: number
  /** Closed voting sessions in the last 7 days — proxy for "active right now". */
  votesClosed7d: number
  /** Server timestamp — surfaced for cache-debug. */
  generatedAt: string
}

async function computeStats(): Promise<PublicStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000)

  const [users, groups, votesAll, votes7d] = await Promise.all([
    db('users').count<{ count: string }[]>('* as count').first(),
    db('groups').count<{ count: string }[]>('* as count').first(),
    db('voting_sessions').where({ status: 'closed' }).count<{ count: string }[]>('* as count').first(),
    db('voting_sessions')
      .where({ status: 'closed' })
      .where('closed_at', '>=', sevenDaysAgo)
      .count<{ count: string }[]>('* as count')
      .first(),
  ])

  return {
    users: Number(users?.count ?? 0),
    groups: Number(groups?.count ?? 0),
    votesClosed: Number(votesAll?.count ?? 0),
    votesClosed7d: Number(votes7d?.count ?? 0),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * GET /api/stats/public — unauthenticated landing-page social-proof
 * aggregates. No PII, no per-user data; only roll-ups that cannot
 * identify any individual.
 *
 * Cached in-memory for 5 minutes (these numbers move slowly and the
 * landing page is the highest-traffic surface). Failures fall back to
 * the cached value if available, otherwise return zeros — analytics
 * must never block the marketing page from rendering.
 */
router.get('/public', async (_req: Request, res: Response) => {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    res.json(cache.value)
    return
  }

  try {
    const stats = await computeStats()
    cache = { value: stats, expiresAt: now + TTL_MS }
    res.json(stats)
  } catch (error) {
    statsLogger.warn({ error: String(error) }, 'failed to compute public stats')
    if (cache) {
      // Stale-while-error: better to show last-known numbers than zero.
      res.json(cache.value)
      return
    }
    res.json({
      users: 0,
      groups: 0,
      votesClosed: 0,
      votesClosed7d: 0,
      generatedAt: new Date().toISOString(),
    })
  }
})

export { router as statsRoutes }
