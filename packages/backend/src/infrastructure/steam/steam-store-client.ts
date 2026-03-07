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

interface SteamAppGenre {
  id: string
  description: string
}

interface SteamAppDetailsResponse {
  success: boolean
  data?: {
    type?: string
    short_description?: string
    is_free?: boolean
    categories?: SteamAppCategory[]
    genres?: SteamAppGenre[]
    metacritic?: { score: number; url: string }
    platforms?: { windows: boolean; mac: boolean; linux: boolean }
    recommendations?: { total: number }
    release_date?: { coming_soon: boolean; date: string }
    controller_support?: string
    content_descriptors?: { ids: number[]; notes: string | null }
  }
}

interface AppDetailsResult {
  type: string | null
  shortDescription: string | null
  isFree: boolean | null
  categories: SteamAppCategory[]
  genres: SteamAppGenre[]
  metacriticScore: number | null
  platforms: { windows: boolean; mac: boolean; linux: boolean } | null
  recommendationsTotal: number | null
  releaseDate: string | null
  comingSoon: boolean | null
  controllerSupport: string | null
  contentDescriptors: { ids: number[]; notes: string | null } | null
}

async function getAppDetails(appId: number): Promise<AppDetailsResult | null> {
  if (isStoreCircuitOpen()) return null

  try {
    const url = `${STEAM_STORE_API_BASE}/appdetails?appids=${appId}&filters=basic,categories,genres,metacritic,platforms,recommendations,release_date,content_descriptors`
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
      return {
        type: null, shortDescription: null, isFree: null,
        categories: [], genres: [], metacriticScore: null,
        platforms: null, recommendationsTotal: null,
        releaseDate: null, comingSoon: null,
        controllerSupport: null, contentDescriptors: null,
      }
    }

    const d = appData.data
    recordStoreSuccess()
    return {
      type: d?.type ?? null,
      shortDescription: d?.short_description ?? null,
      isFree: d?.is_free ?? null,
      categories: d?.categories || [],
      genres: d?.genres || [],
      metacriticScore: d?.metacritic?.score ?? null,
      platforms: d?.platforms ?? null,
      recommendationsTotal: d?.recommendations?.total ?? null,
      releaseDate: d?.release_date?.date ?? null,
      comingSoon: d?.release_date?.coming_soon ?? null,
      controllerSupport: d?.controller_support ?? null,
      contentDescriptors: d?.content_descriptors ?? null,
    }
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

    const details = await getAppDetails(appId)

    if (details === null) {
      // Transient error — skip, will retry next time
      continue
    }

    const categoryIds = details.categories.map(c => c.id)
    const isMultiplayer = categoryIds.some(id => MULTIPLAYER_CATEGORY_IDS.has(id))
    const isCoop = categoryIds.some(id => COOP_CATEGORY_IDS.has(id))

    const row = {
      steam_app_id: appId,
      type: details.type,
      short_description: details.shortDescription,
      is_free: details.isFree,
      categories: JSON.stringify(details.categories),
      genres: JSON.stringify(details.genres),
      metacritic_score: details.metacriticScore,
      platforms: details.platforms ? JSON.stringify(details.platforms) : null,
      recommendations_total: details.recommendationsTotal,
      release_date: details.releaseDate,
      coming_soon: details.comingSoon,
      controller_support: details.controllerSupport,
      content_descriptors: details.contentDescriptors ? JSON.stringify(details.contentDescriptors) : null,
      is_multiplayer: isMultiplayer,
      is_coop: isCoop,
      enriched_at: new Date(),
    }

    await db('game_metadata')
      .insert(row)
      .onConflict('steam_app_id')
      .merge(row)

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
