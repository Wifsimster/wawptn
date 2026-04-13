import { env } from '../../config/env.js'
import { epicLogger } from '../logger/logger.js'
import { encryptToken, decryptToken } from '../crypto/token-cipher.js'
import { db } from '../database/connection.js'

const EPIC_AUTH_BASE = 'https://www.epicgames.com/id'
const EPIC_TOKEN_URL = 'https://api.epicgames.dev/epic/oauth/v2/token'
const EPIC_ACCOUNT_API = 'https://api.epicgames.dev/epic/id/v2'
const EPIC_LIBRARY_API = 'https://library-service.live.use1a.on.epicgames.com/library/api/public'

// Rate limiter: 1 request per second
let lastRequestTime = 0
async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()
  return fetch(url, options)
}

// Circuit breaker
let consecutiveFailures = 0
let circuitOpenUntil = 0
const CIRCUIT_THRESHOLD = 3
const CIRCUIT_RESET_MS = 5 * 60 * 1000

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_THRESHOLD) return false
  if (Date.now() > circuitOpenUntil) {
    consecutiveFailures = 0
    return false
  }
  return true
}

function recordSuccess(): void {
  consecutiveFailures = 0
}

function recordFailure(): void {
  consecutiveFailures++
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS
    epicLogger.warn({ until: new Date(circuitOpenUntil).toISOString() }, 'Epic API circuit breaker opened')
  }
}

// In-memory cache
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Health snapshot exposed to /api/admin/health. */
export function getHealth(): {
  state: 'closed' | 'open'
  consecutiveFailures: number
  circuitOpenUntil: string | null
  cacheSize: number
  enabled: boolean
} {
  const open = isCircuitOpen()
  return {
    state: open ? 'open' : 'closed',
    consecutiveFailures,
    circuitOpenUntil: open && circuitOpenUntil > 0 ? new Date(circuitOpenUntil).toISOString() : null,
    cacheSize: cache.size,
    enabled: isEpicEnabled(),
  }
}

export function isEpicEnabled(): boolean {
  return !!(env.EPIC_CLIENT_ID && env.EPIC_CLIENT_SECRET && env.EPIC_REDIRECT_URI)
}

export interface EpicTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  account_id: string
}

export interface EpicOwnedGame {
  appName: string
  catalogItemId: string
  namespace: string
  displayName: string
}

export function getEpicAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.EPIC_CLIENT_ID,
    response_type: 'code',
    scope: 'basic_profile',
    redirect_uri: env.EPIC_REDIRECT_URI,
    state,
  })
  return `${EPIC_AUTH_BASE}/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<EpicTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const credentials = Buffer.from(`${env.EPIC_CLIENT_ID}:${env.EPIC_CLIENT_SECRET}`).toString('base64')

    const response = await rateLimitedFetch(EPIC_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.EPIC_REDIRECT_URI,
      }).toString(),
    })

    if (!response.ok) {
      recordFailure()
      epicLogger.error({ status: response.status }, 'Epic token exchange failed')
      return null
    }

    const data = await response.json() as EpicTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    epicLogger.error({ error: String(error) }, 'Epic token exchange request failed')
    return null
  }
}

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<EpicTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const refreshToken = decryptToken(encryptedRefreshToken)
    const credentials = Buffer.from(`${env.EPIC_CLIENT_ID}:${env.EPIC_CLIENT_SECRET}`).toString('base64')

    const response = await rateLimitedFetch(EPIC_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })

    if (!response.ok) {
      recordFailure()
      epicLogger.error({ status: response.status }, 'Epic token refresh failed')
      return null
    }

    const data = await response.json() as EpicTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    epicLogger.error({ error: String(error) }, 'Epic token refresh request failed')
    return null
  }
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await db('accounts')
    .where({ user_id: userId, provider_id: 'epic' })
    .first()

  if (!account?.access_token) return null

  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null
  const bufferMs = 5 * 60 * 1000

  if (expiresAt && expiresAt.getTime() - bufferMs > Date.now()) {
    return decryptToken(account.access_token)
  }

  if (!account.refresh_token) {
    epicLogger.warn({ userId }, 'Epic access token expired and no refresh token available')
    await db('accounts').where({ user_id: userId, provider_id: 'epic' }).update({ status: 'needs_relink' })
    return null
  }

  const refreshed = await refreshAccessToken(account.refresh_token)
  if (!refreshed) {
    await db('accounts').where({ user_id: userId, provider_id: 'epic' }).update({ status: 'needs_relink' })
    return null
  }

  await db('accounts').where({ user_id: userId, provider_id: 'epic' }).update({
    access_token: encryptToken(refreshed.access_token),
    refresh_token: encryptToken(refreshed.refresh_token),
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
    status: 'active',
    updated_at: db.fn.now(),
  })

  return refreshed.access_token
}

export async function getEpicProfile(accessToken: string): Promise<{ accountId: string; displayName: string } | null> {
  if (isCircuitOpen()) return null

  try {
    const response = await rateLimitedFetch(`${EPIC_ACCOUNT_API}/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      recordFailure()
      epicLogger.error({ status: response.status }, 'Epic profile fetch failed')
      return null
    }

    const data = await response.json() as { accountId: string; displayName: string }[]
    recordSuccess()
    return data[0] ?? null
  } catch (error) {
    recordFailure()
    epicLogger.error({ error: String(error) }, 'Epic profile fetch request failed')
    return null
  }
}

export async function getOwnedGames(userId: string): Promise<EpicOwnedGame[] | null> {
  const cacheKey = `epic_owned_games:${userId}`
  const cached = getCached<EpicOwnedGame[]>(cacheKey)
  if (cached) return cached

  if (isCircuitOpen()) return null

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return null

  try {
    const response = await rateLimitedFetch(`${EPIC_LIBRARY_API}/items?includeMetadata=true`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      recordFailure()
      epicLogger.error({ status: response.status, userId }, 'Epic GetOwnedGames failed')
      return null
    }

    const data = await response.json() as { records: EpicOwnedGame[] }
    recordSuccess()

    const games = data.records || []
    setCache(cacheKey, games)
    epicLogger.info({ userId, gameCount: games.length }, 'fetched Epic library')
    return games
  } catch (error) {
    recordFailure()
    epicLogger.error({ error: String(error), userId }, 'Epic API request failed')
    return null
  }
}

export function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
