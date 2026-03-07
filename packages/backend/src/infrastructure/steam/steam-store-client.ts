import { db } from '../database/connection.js'
import { steamLogger } from '../logger/logger.js'

const STEAM_STORE_API_BASE = 'https://store.steampowered.com/api'

// Steam category IDs for multiplayer-related modes
const MULTIPLAYER_CATEGORY_IDS = new Set([
  1,  // Multi-player
  9,  // Co-op
  36, // Online PvP
  37, // Local PvP
  38, // Online Co-op
  39, // Shared/Split Screen Co-op
  47, // LAN PvP
  48, // LAN Co-op
  49, // Shared/Split Screen
])

const COOP_CATEGORY_IDS = new Set([
  9,  // Co-op
  38, // Online Co-op
  39, // Shared/Split Screen Co-op
  48, // LAN Co-op
])

// Separate rate limiter: 1 request per 1.5 seconds
let lastStoreRequestTime = 0

async function storeRateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastStoreRequestTime
  if (timeSinceLastRequest < 1500) {
    await new Promise(resolve => setTimeout(resolve, 1500 - timeSinceLastRequest))
  }
  lastStoreRequestTime = Date.now()
  return fetch(url)
}

// Separate circuit breaker (isolated from main Steam Web API)
let storeConsecutiveFailures = 0
let storeCircuitOpenUntil = 0
const STORE_CIRCUIT_THRESHOLD = 5
const STORE_CIRCUIT_RESET_MS = 5 * 60 * 1000

function isStoreCircuitOpen(): boolean {
  if (storeConsecutiveFailures < STORE_CIRCUIT_THRESHOLD) return false
  if (Date.now() > storeCircuitOpenUntil) {
    storeConsecutiveFailures = 0
    return false
  }
  return true
}

function recordStoreSuccess(): void {
  storeConsecutiveFailures = 0
}

function recordStoreFailure(): void {
  storeConsecutiveFailures++
  if (storeConsecutiveFailures >= STORE_CIRCUIT_THRESHOLD) {
    storeCircuitOpenUntil = Date.now() + STORE_CIRCUIT_RESET_MS
    steamLogger.warn(
      { until: new Date(storeCircuitOpenUntil).toISOString() },
      'Steam Store API circuit breaker opened'
    )
  }
}

interface SteamAppCategory {
  id: number
  description: string
}

interface SteamAppDetailsResponse {
  success: boolean
  data?: {
    categories?: SteamAppCategory[]
  }
}

async function getAppDetails(appId: number): Promise<SteamAppCategory[] | null> {
  if (isStoreCircuitOpen()) return null

  try {
    const url = `${STEAM_STORE_API_BASE}/appdetails?appids=${appId}&filters=categories`
    const response = await storeRateLimitedFetch(url)

    if (!response.ok) {
      recordStoreFailure()
      steamLogger.error({ status: response.status, appId }, 'Steam GetAppDetails failed')
      return null
    }

    const data = (await response.json()) as Record<string, SteamAppDetailsResponse>
    const appData = data[String(appId)]

    if (!appData?.success) {
      // App delisted or region-locked — not a service failure
      recordStoreSuccess()
      return []
    }

    recordStoreSuccess()
    return appData.data?.categories || []
  } catch (error) {
    recordStoreFailure()
    steamLogger.error({ error: String(error), appId }, 'Steam Store API request failed')
    return null
  }
}

async function enrichGameMetadata(appIds: number[]): Promise<void> {
  if (appIds.length === 0) return

  // Find which ones still need enrichment
  const existing = await db('game_metadata')
    .whereIn('steam_app_id', appIds)
    .whereNotNull('enriched_at')
    .select('steam_app_id')

  const existingSet = new Set(existing.map((r: { steam_app_id: number }) => r.steam_app_id))
  const toEnrich = appIds.filter(id => !existingSet.has(id))

  if (toEnrich.length === 0) return

  steamLogger.info({ count: toEnrich.length }, 'starting game metadata enrichment')

  let enrichedCount = 0

  for (const appId of toEnrich) {
    if (isStoreCircuitOpen()) {
      steamLogger.warn(
        { remaining: toEnrich.length - toEnrich.indexOf(appId) },
        'Store circuit breaker open, pausing enrichment'
      )
      break
    }

    const categories = await getAppDetails(appId)

    if (categories === null) {
      // Transient error — skip, will retry next time
      continue
    }

    const categoryIds = categories.map(c => c.id)
    const isMultiplayer = categoryIds.some(id => MULTIPLAYER_CATEGORY_IDS.has(id))
    const isCoop = categoryIds.some(id => COOP_CATEGORY_IDS.has(id))

    await db('game_metadata')
      .insert({
        steam_app_id: appId,
        categories: JSON.stringify(categories),
        is_multiplayer: isMultiplayer,
        is_coop: isCoop,
        enriched_at: new Date(),
      })
      .onConflict('steam_app_id')
      .merge({
        categories: JSON.stringify(categories),
        is_multiplayer: isMultiplayer,
        is_coop: isCoop,
        enriched_at: new Date(),
      })

    enrichedCount++
  }

  if (enrichedCount > 0) {
    steamLogger.info({ enrichedCount, total: toEnrich.length }, 'game metadata enrichment batch done')
  }
}

// Sequential enrichment queue to prevent concurrent Steam Store API calls
let enrichmentQueue: Promise<void> = Promise.resolve()

export function triggerBackgroundEnrichment(appIds: number[]): void {
  enrichmentQueue = enrichmentQueue
    .then(() => enrichGameMetadata(appIds))
    .catch(err => {
      steamLogger.error({ error: String(err) }, 'background enrichment failed')
    })
}
