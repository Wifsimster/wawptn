import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { SESSION_COOKIE_NAME } from '../../config/session.js'

const router = Router()

const analyticsLogger = logger.child({ module: 'analytics' })

const ALLOWED_EVENTS = new Set<string>([
  'user.login',
  'group.created',
  'group.joined',
  'group.join_failed',
  'group.create_failed',
  'invite.generated',
  'invite.link_copied',
  'invite.shared',
  'sync.triggered',
  'vote.started',
  'vote.completed',
  'game.launched_in_steam',
])

const MAX_PROPS = 16
const MAX_STRING_LEN = 120

function isSafeValue(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'boolean' || typeof v === 'number') return true
  if (typeof v === 'string') return v.length <= MAX_STRING_LEN
  return false
}

function sanitizeProperties(raw: unknown): Record<string, string | number | boolean | null> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string | number | boolean | null> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_PROPS) break
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue
    if (!isSafeValue(value)) continue
    out[key] = value as string | number | boolean | null
    count++
  }
  return out
}

async function getOptionalUserId(req: Request): Promise<string | undefined> {
  const token = req.signedCookies?.[SESSION_COOKIE_NAME]
  if (!token) return undefined
  try {
    const session = await db('sessions')
      .where({ token })
      .where('expires_at', '>', new Date())
      .first()
    return session?.user_id
  } catch {
    return undefined
  }
}

router.post('/', async (req: Request, res: Response) => {
  res.status(204).end()

  try {
    const body = req.body as { event?: unknown; properties?: unknown; ts?: unknown } | undefined
    const event = typeof body?.event === 'string' ? body.event : null
    if (!event || !ALLOWED_EVENTS.has(event)) return

    const properties = sanitizeProperties(body?.properties)
    const userId = await getOptionalUserId(req)

    analyticsLogger.info(
      {
        event,
        userId: userId ?? null,
        properties,
      },
      'analytics event',
    )
  } catch (err) {
    analyticsLogger.warn({ err: String(err) }, 'analytics event handler error')
  }
})

export { router as eventRoutes }
