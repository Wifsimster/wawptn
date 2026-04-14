import { env } from '../../config/env.js'
import { gogLogger } from '../logger/logger.js'
import { encryptToken, decryptToken } from '../crypto/token-cipher.js'
import { db } from '../database/connection.js'

const GOG_AUTH_URL = 'https://auth.gog.com/auth'
const GOG_TOKEN_URL = 'https://auth.gog.com/token'
const GOG_LIBRARY_API = 'https://embed.gog.com/account/getFilteredProducts'

const MAX_PAGES = 100

// Rate limiter: 1 request per second (independent from other providers)
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

// Circuit breaker (independent from other providers)
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
    gogLogger.warn({ until: new Date(circuitOpenUntil).toISOString() }, 'GOG API circuit breaker opened')
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
    enabled: isGogEnabled(),
  }
}

export function isGogEnabled(): boolean {
  return !!(env.GOG_CLIENT_ID && env.GOG_CLIENT_SECRET && env.GOG_REDIRECT_URI)
}

export interface GogTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  user_id: string
}

export interface GogOwnedGame {
  id: number
  title: string
  image: string
}

export function getGogAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOG_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.GOG_REDIRECT_URI,
    state,
  })
  return `${GOG_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<GogTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.GOG_CLIENT_ID,
      client_secret: env.GOG_CLIENT_SECRET,
      code,
      redirect_uri: env.GOG_REDIRECT_URI,
    })

    const response = await rateLimitedFetch(`${GOG_TOKEN_URL}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      recordFailure()
      gogLogger.error({ status: response.status }, 'GOG token exchange failed')
      return null
    }

    const data = await response.json() as GogTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    gogLogger.error({ error: String(error) }, 'GOG token exchange request failed')
    return null
  }
}

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<GogTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const refreshToken = decryptToken(encryptedRefreshToken)

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOG_CLIENT_ID,
      client_secret: env.GOG_CLIENT_SECRET,
      refresh_token: refreshToken,
    })

    const response = await rateLimitedFetch(`${GOG_TOKEN_URL}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      recordFailure()
      gogLogger.error({ status: response.status }, 'GOG token refresh failed')
      return null
    }

    const data = await response.json() as GogTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    gogLogger.error({ error: String(error) }, 'GOG token refresh request failed')
    return null
  }
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await db('accounts')
    .where({ user_id: userId, provider_id: 'gog' })
    .first()

  if (!account?.access_token) return null

  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null
  const bufferMs = 5 * 60 * 1000

  if (expiresAt && expiresAt.getTime() - bufferMs > Date.now()) {
    return decryptToken(account.access_token)
  }

  if (!account.refresh_token) {
    gogLogger.warn({ userId }, 'GOG access token expired and no refresh token available')
    await db('accounts').where({ user_id: userId, provider_id: 'gog' }).update({ status: 'needs_relink' })
    return null
  }

  const refreshed = await refreshAccessToken(account.refresh_token)
  if (!refreshed) {
    await db('accounts').where({ user_id: userId, provider_id: 'gog' }).update({ status: 'needs_relink' })
    return null
  }

  await db('accounts').where({ user_id: userId, provider_id: 'gog' }).update({
    access_token: encryptToken(refreshed.access_token),
    refresh_token: encryptToken(refreshed.refresh_token),
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
    status: 'active',
    updated_at: db.fn.now(),
  })

  return refreshed.access_token
}

export async function getOwnedGames(userId: string): Promise<GogOwnedGame[] | null> {
  const cacheKey = `gog_owned_games:${userId}`
  const cached = getCached<GogOwnedGame[]>(cacheKey)
  if (cached) return cached

  if (isCircuitOpen()) return null

  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) return null

  try {
    const allGames: GogOwnedGame[] = []
    let page = 1

    while (page <= MAX_PAGES) {
      const url = `${GOG_LIBRARY_API}?mediaType=1&page=${page}`
      const response = await rateLimitedFetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(30_000),
      })

      if (!response.ok) {
        recordFailure()
        gogLogger.error({ status: response.status, userId, page }, 'GOG GetOwnedGames failed')
        return null
      }

      const data = await response.json() as {
        totalPages: number
        products: { id: number; title: string; image: string }[]
      }
      recordSuccess()

      if (data.products) {
        for (const p of data.products) {
          allGames.push({ id: p.id, title: p.title, image: p.image })
        }
      }

      if (page >= data.totalPages) break
      page++
    }

    setCache(cacheKey, allGames)
    gogLogger.info({ userId, gameCount: allGames.length }, 'fetched GOG library')
    return allGames
  } catch (error) {
    recordFailure()
    gogLogger.error({ error: String(error), userId }, 'GOG API request failed')
    return null
  }
}

// Re-export the shared canonical name normaliser. See Marcus #1 notes
// on epic-client.ts — the logic lives in domain/game-name.ts so the
// dedupe and sync paths agree on what "two different titles mean the
// same game" looks like.
export { normalizeGameName } from '../../domain/game-name.js'
