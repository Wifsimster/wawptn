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
    name?: string
    header_image?: string
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
  // Also re-enrich games that were enriched before genres/metacritic columns existed
  const existing = await db('game_metadata')
    .whereIn('steam_app_id', appIds)
    .whereNotNull('enriched_at')
    .whereNotNull('genres')
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

    // Look up game_id from platform mapping
    const platformMapping = await db('game_platform_ids')
      .where({ platform: 'steam', platform_game_id: String(appId) })
      .first()

    const row = {
      steam_app_id: appId,
      game_id: platformMapping?.game_id || null,
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

// ─── New-releases digest support ────────────────────────────────────────────
//
// Steam has no clean, date-filtered "new releases" Web API endpoint, so the
// weekly digest uses the public storefront search (sorted by release date,
// pre-filtered to multiplayer/co-op categories) to get a candidate app-id
// list, then confirms each candidate through `getStoreAppForDigest` — the
// authoritative source for category, type, release date and content
// descriptors. Both reuse the rate limiter + circuit breaker above so the
// digest can never out-pace or bypass the Store API protections.

const STEAM_STORE_SEARCH_URL = 'https://store.steampowered.com/search/results/'

/** Authoritative per-app metadata the digest needs. `null` means the Store
 *  API was unavailable (circuit open or transient error) — the caller must
 *  treat that as "stop scanning", not "app rejected". */
export interface DigestStoreApp {
  appId: number
  name: string
  headerImage: string | null
  type: string | null
  isCoop: boolean
  isMultiplayer: boolean
  /** Localized release-date string from Steam (English locale requested). */
  releaseDateRaw: string | null
  comingSoon: boolean
  contentDescriptorIds: number[]
}

/**
 * Candidate app IDs for the weekly digest, newest-first.
 *
 * Primary source: the storefront search JSON, sorted `Released_DESC` and
 * pre-filtered server-side to Multi-player (1), Co-op (9) and Online Co-op
 * (38). The response embeds an HTML fragment; we extract only the
 * `data-ds-appid` attribute from it — the narrowest, most stable thing to
 * scrape (prices/badges get restyled constantly, app IDs don't).
 *
 * Fallback: `featuredcategories.new_releases` when search yields nothing.
 */
export async function getNewReleaseCandidateIds(limit = 100): Promise<number[]> {
  if (isStoreCircuitOpen()) return []

  const ids = new Set<number>()

  try {
    const params = new URLSearchParams({
      query: '',
      start: '0',
      count: String(limit),
      sort_by: 'Released_DESC',
      cc: 'us',
      l: 'english',
      infinite: '1',
      json: '1',
    })
    const url = `${STEAM_STORE_SEARCH_URL}?${params.toString()}&category2=1&category2=9&category2=38`
    const response = await storeRateLimitedFetch(url)

    if (response.ok) {
      recordStoreSuccess()
      const json = (await response.json()) as { results_html?: string }
      for (const match of (json.results_html ?? '').matchAll(/data-ds-appid="([0-9,]+)"/g)) {
        const first = match[1]?.split(',')[0]
        const id = Number(first)
        if (Number.isInteger(id) && id > 0) ids.add(id)
      }
    } else {
      recordStoreFailure()
      steamLogger.warn({ status: response.status }, 'Steam new-releases search failed')
    }
  } catch (error) {
    recordStoreFailure()
    steamLogger.error({ error: String(error) }, 'Steam new-releases search request failed')
  }

  if (ids.size > 0) return [...ids]

  // Fallback: the curated "new & trending" block. Coarser than the search
  // (no strict 7-day guarantee) but every candidate is still confirmed by
  // getStoreAppForDigest, which re-checks the real release date.
  try {
    const response = await storeRateLimitedFetch(`${STEAM_STORE_API_BASE}/featuredcategories?cc=us&l=english`)
    if (response.ok) {
      recordStoreSuccess()
      const json = (await response.json()) as { new_releases?: { items?: { id?: number }[] } }
      for (const item of json.new_releases?.items ?? []) {
        if (typeof item.id === 'number' && item.id > 0) ids.add(item.id)
      }
    } else {
      recordStoreFailure()
    }
  } catch (error) {
    steamLogger.error({ error: String(error) }, 'Steam featuredcategories fallback failed')
  }

  return [...ids]
}

/**
 * Authoritative app details for a digest candidate. English locale is
 * requested explicitly so `release_date.date` comes back in a parseable
 * `D Month, YYYY` shape regardless of the server region.
 *
 * Returns `null` only when the Store API is unavailable (circuit open or a
 * transient/HTTP error). A delisted or region-locked app comes back as a
 * resolved object with null fields — that's a "reject this game", not a
 * "stop scanning".
 */
export async function getStoreAppForDigest(appId: number): Promise<DigestStoreApp | null> {
  if (isStoreCircuitOpen()) return null

  try {
    const url = `${STEAM_STORE_API_BASE}/appdetails?appids=${appId}&cc=us&l=english&filters=basic,categories,release_date,content_descriptors`
    const response = await storeRateLimitedFetch(url)

    if (!response.ok) {
      recordStoreFailure()
      steamLogger.error({ status: response.status, appId }, 'Steam digest appdetails failed')
      return null
    }

    const data = (await response.json()) as Record<string, SteamAppDetailsResponse>
    const appData = data[String(appId)]
    recordStoreSuccess()

    if (!appData?.success || !appData.data) {
      // Delisted / region-locked — resolved, but not digest-eligible.
      return {
        appId,
        name: '',
        headerImage: null,
        type: null,
        isCoop: false,
        isMultiplayer: false,
        releaseDateRaw: null,
        comingSoon: false,
        contentDescriptorIds: [],
      }
    }

    const d = appData.data
    const categoryIds = (d.categories ?? []).map((c) => c.id)
    return {
      appId,
      name: d.name ?? '',
      headerImage: d.header_image ?? null,
      type: d.type ?? null,
      isMultiplayer: categoryIds.some((id) => MULTIPLAYER_CATEGORY_IDS.has(id)),
      isCoop: categoryIds.some((id) => COOP_CATEGORY_IDS.has(id)),
      releaseDateRaw: d.release_date?.date ?? null,
      comingSoon: d.release_date?.coming_soon ?? false,
      contentDescriptorIds: d.content_descriptors?.ids ?? [],
    }
  } catch (error) {
    recordStoreFailure()
    steamLogger.error({ error: String(error), appId }, 'Steam digest appdetails request failed')
    return null
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
