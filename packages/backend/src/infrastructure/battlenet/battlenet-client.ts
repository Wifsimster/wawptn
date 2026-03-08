import { env } from '../../config/env.js'
import { battlenetLogger } from '../logger/logger.js'
import { encryptToken, decryptToken } from '../crypto/token-cipher.js'
import { db } from '../database/connection.js'

const BATTLENET_AUTH_URL = 'https://oauth.battle.net/authorize'
const BATTLENET_TOKEN_URL = 'https://oauth.battle.net/token'
const BATTLENET_USERINFO_URL = 'https://oauth.battle.net/userinfo'

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
    battlenetLogger.warn({ until: new Date(circuitOpenUntil).toISOString() }, 'Battle.net API circuit breaker opened')
  }
}

export function isBattlenetEnabled(): boolean {
  return !!(env.BATTLENET_CLIENT_ID && env.BATTLENET_CLIENT_SECRET)
}

export interface BattlenetTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  sub: string
}

export interface BattlenetUserInfo {
  sub: string
  id: number
  battletag: string
}

export function getBattlenetAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.BATTLENET_CLIENT_ID,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    state,
  })
  return `${BATTLENET_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<BattlenetTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const credentials = Buffer.from(`${env.BATTLENET_CLIENT_ID}:${env.BATTLENET_CLIENT_SECRET}`).toString('base64')

    const response = await rateLimitedFetch(BATTLENET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!response.ok) {
      recordFailure()
      battlenetLogger.error({ status: response.status }, 'Battle.net token exchange failed')
      return null
    }

    const data = await response.json() as BattlenetTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    battlenetLogger.error({ error: String(error) }, 'Battle.net token exchange request failed')
    return null
  }
}

export async function getBattlenetUserInfo(accessToken: string): Promise<BattlenetUserInfo | null> {
  if (isCircuitOpen()) return null

  try {
    const response = await rateLimitedFetch(BATTLENET_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      recordFailure()
      battlenetLogger.error({ status: response.status }, 'Battle.net userinfo fetch failed')
      return null
    }

    const data = await response.json() as BattlenetUserInfo
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    battlenetLogger.error({ error: String(error) }, 'Battle.net userinfo fetch request failed')
    return null
  }
}

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<BattlenetTokenResponse | null> {
  if (isCircuitOpen()) return null

  try {
    const refreshToken = decryptToken(encryptedRefreshToken)
    const credentials = Buffer.from(`${env.BATTLENET_CLIENT_ID}:${env.BATTLENET_CLIENT_SECRET}`).toString('base64')

    const response = await rateLimitedFetch(BATTLENET_TOKEN_URL, {
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
      battlenetLogger.error({ status: response.status }, 'Battle.net token refresh failed')
      return null
    }

    const data = await response.json() as BattlenetTokenResponse
    recordSuccess()
    return data
  } catch (error) {
    recordFailure()
    battlenetLogger.error({ error: String(error) }, 'Battle.net token refresh request failed')
    return null
  }
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await db('accounts')
    .where({ user_id: userId, provider_id: 'battlenet' })
    .first()

  if (!account?.access_token) return null

  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null
  const bufferMs = 5 * 60 * 1000

  if (expiresAt && expiresAt.getTime() - bufferMs > Date.now()) {
    return decryptToken(account.access_token)
  }

  if (!account.refresh_token) {
    battlenetLogger.warn({ userId }, 'Battle.net access token expired and no refresh token available')
    return null
  }

  const refreshed = await refreshAccessToken(account.refresh_token)
  if (!refreshed) return null

  await db('accounts').where({ user_id: userId, provider_id: 'battlenet' }).update({
    access_token: encryptToken(refreshed.access_token),
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
    updated_at: db.fn.now(),
  })

  return refreshed.access_token
}
