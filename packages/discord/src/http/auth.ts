import crypto from 'node:crypto'
import { env } from '../env.js'

/**
 * Constant-time comparison of the backend → bot shared secret. Symmetric
 * with the equivalent check on the backend (`requireBotAuth` middleware),
 * so both directions use the same `Authorization: Bot <secret>` format.
 */
export function isAuthorized(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Bot ')) return false
  const provided = authHeader.slice(4)
  const expected = env.DISCORD_BOT_API_SECRET
  if (!expected) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
