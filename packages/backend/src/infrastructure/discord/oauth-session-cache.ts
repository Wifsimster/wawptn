/**
 * In-memory cache for short-lived Discord OAuth picker sessions. Each entry
 * holds:
 *   - the short-lived Discord access token (used only to list guilds),
 *   - the logged-in WAWPTN user id (set once the code is exchanged).
 *
 * Two maps are maintained:
 *   - `states` keyed by the CSRF `state` nonce we generated when handing
 *     the authorize URL to the browser, used only in the window between
 *     redirect and callback.
 *   - `sessions` keyed by WAWPTN `userId`, populated on a successful
 *     callback; this is what `GET /api/discord/guilds` reads from.
 *
 * We deliberately avoid Redis here — MVP convention says "No Redis for
 * MVP — in-memory cache" (see CLAUDE.md). A sticky-session deployment
 * or a follow-up to persist to Postgres is acceptable future work, but
 * out of scope for this feature.
 */
import crypto from 'crypto'
import type { DiscordOAuthToken } from './oauth-client.js'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 min — caller should finish the redirect quickly
const SESSION_TTL_MS = 15 * 60 * 1000 // 15 min — enough to pick guild + channel

interface StateEntry {
  userId: string
  createdAt: number
}

interface SessionEntry {
  userId: string
  token: DiscordOAuthToken
  createdAt: number
}

const states = new Map<string, StateEntry>()
const sessions = new Map<string, SessionEntry>()

/** Create a new state nonce bound to a WAWPTN user, store it, and return
 *  the nonce so the caller can pass it to `buildAuthorizeUrl`. */
export function createOAuthState(userId: string): string {
  sweepStates()
  const nonce = crypto.randomBytes(24).toString('base64url')
  states.set(nonce, { userId, createdAt: Date.now() })
  return nonce
}

/** Consume a state nonce. Returns the bound userId if the nonce is known
 *  and unexpired; otherwise returns null. Consumption deletes the entry
 *  so the same nonce cannot be reused. */
export function consumeOAuthState(nonce: string): string | null {
  const entry = states.get(nonce)
  if (!entry) return null
  states.delete(nonce)
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null
  return entry.userId
}

/** Store an access token against the WAWPTN user. Overwrites any prior
 *  token for the same user (re-authorisation resets the picker). */
export function setSession(userId: string, token: DiscordOAuthToken): void {
  sweepSessions()
  sessions.set(userId, { userId, token, createdAt: Date.now() })
}

/** Look up the active session for a WAWPTN user. Returns null when the
 *  session is missing or expired. */
export function getSession(userId: string): SessionEntry | null {
  const entry = sessions.get(userId)
  if (!entry) return null
  if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
    sessions.delete(userId)
    return null
  }
  return entry
}

/** Drop the session for a WAWPTN user. Called after the group is created
 *  so we do not hold onto the Discord access token longer than needed. */
export function clearSession(userId: string): void {
  sessions.delete(userId)
}

function sweepStates(): void {
  const now = Date.now()
  for (const [key, entry] of states) {
    if (now - entry.createdAt > STATE_TTL_MS) states.delete(key)
  }
}

function sweepSessions(): void {
  const now = Date.now()
  for (const [key, entry] of sessions) {
    if (now - entry.createdAt > SESSION_TTL_MS) sessions.delete(key)
  }
}
