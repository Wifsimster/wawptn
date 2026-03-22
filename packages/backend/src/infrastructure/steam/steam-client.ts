import crypto from 'crypto'
import { env } from '../../config/env.js'
import { steamLogger } from '../logger/logger.js'

const STEAM_API_BASE = 'https://api.steampowered.com'
const STEAM_CDN_BASE = 'https://cdn.akamai.steamstatic.com/steam/apps'

// Simple in-memory cache with TTL
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

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

// Rate limiter: 1 request per second
let lastRequestTime = 0
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest))
  }
  lastRequestTime = Date.now()
  return fetch(url)
}

// Circuit breaker state
let consecutiveFailures = 0
let circuitOpenUntil = 0
const CIRCUIT_THRESHOLD = 3
const CIRCUIT_RESET_MS = 5 * 60 * 1000 // 5 minutes

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
    steamLogger.warn({ until: new Date(circuitOpenUntil).toISOString() }, 'Steam API circuit breaker opened')
  }
}

export interface SteamOwnedGame {
  appid: number
  name: string
  playtime_forever: number
  playtime_2weeks?: number
  img_icon_url: string
}

export interface SteamPlayerSummary {
  steamid: string
  personaname: string
  avatarfull: string
  profileurl: string
  communityvisibilitystate: number
}

export async function getOwnedGames(steamId: string): Promise<SteamOwnedGame[] | null> {
  const cacheKey = `owned_games:${steamId}`
  const cached = getCached<SteamOwnedGame[]>(cacheKey)
  if (cached) return cached

  if (isCircuitOpen()) {
    steamLogger.warn('Steam API circuit breaker is open, returning cached data')
    return null
  }

  try {
    const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
    const response = await rateLimitedFetch(url)

    if (!response.ok) {
      recordFailure()
      steamLogger.error({ status: response.status, steamId }, 'Steam GetOwnedGames failed')
      return null
    }

    const data = await response.json() as { response: { games?: SteamOwnedGame[]; game_count?: number } }
    recordSuccess()

    const games = data.response.games || []

    // Empty list might mean private profile
    if (games.length === 0 && data.response.game_count === undefined) {
      steamLogger.warn({ steamId }, 'Steam profile might be private — no games returned')
      return []
    }

    setCache(cacheKey, games)
    steamLogger.info({ steamId, gameCount: games.length }, 'fetched Steam library')
    return games
  } catch (error) {
    recordFailure()
    steamLogger.error({ error: String(error), steamId }, 'Steam API request failed')
    return null
  }
}

export async function getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
  const cacheKey = `player_summary:${steamId}`
  const cached = getCached<SteamPlayerSummary>(cacheKey)
  if (cached) return cached

  if (isCircuitOpen()) return null

  try {
    const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${env.STEAM_API_KEY}&steamids=${steamId}&format=json`
    const response = await rateLimitedFetch(url)

    if (!response.ok) {
      recordFailure()
      return null
    }

    const data = await response.json() as { response: { players: SteamPlayerSummary[] } }
    recordSuccess()

    const player = data.response.players[0]
    if (!player) return null

    setCache(cacheKey, player)
    return player
  } catch (error) {
    recordFailure()
    steamLogger.error({ error: String(error), steamId }, 'Steam GetPlayerSummaries failed')
    return null
  }
}

export function getHeaderImageUrl(appId: number): string {
  return `${STEAM_CDN_BASE}/${appId}/header.jpg`
}

export function getSteamRunUrl(appId: number): string {
  return `steam://run/${appId}`
}

// Generate a cryptographically random invite token
export function generateInviteToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  return { token, hash }
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Steam OpenID 2.0 verification
const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login'

export function getSteamLoginUrl(returnUrl: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': new URL(returnUrl).origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })

  return `${STEAM_OPENID_URL}?${params.toString()}`
}

export async function verifySteamLogin(params: Record<string, string>): Promise<string | null> {
  // Verify the claimed_id is from Steam
  const claimedId = params['openid.claimed_id']
  if (!claimedId || !claimedId.startsWith('https://steamcommunity.com/openid/id/')) {
    steamLogger.warn({ claimedId }, 'invalid Steam claimed_id')
    return null
  }

  // Build verification request
  const verifyParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    verifyParams.set(key, value)
  }
  verifyParams.set('openid.mode', 'check_authentication')

  try {
    const response = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    })

    const text = await response.text()

    if (!text.includes('is_valid:true')) {
      steamLogger.warn('Steam OpenID verification failed')
      return null
    }

    // Extract Steam ID from claimed_id
    const steamId = claimedId.replace('https://steamcommunity.com/openid/id/', '')
    steamLogger.info({ steamId }, 'Steam OpenID verified')
    return steamId
  } catch (error) {
    steamLogger.error({ error: String(error) }, 'Steam OpenID verification request failed')
    return null
  }
}
