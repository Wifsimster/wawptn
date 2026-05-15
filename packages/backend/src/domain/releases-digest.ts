import type { ReleaseDigestGame } from '@wawptn/types'
import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import {
  getNewReleaseCandidateIds,
  getStoreAppForDigest,
  type DigestStoreApp,
} from '../infrastructure/steam/steam-store-client.js'
import { getHeaderImageUrl } from '../infrastructure/steam/steam-client.js'
import { notifyReleasesDigest } from '../infrastructure/discord/releases-notifier.js'
import { isUserPremium } from './subscription-service.js'

const digestLogger = logger.child({ module: 'releases-digest' })

/** How many qualifying releases the shared weekly pool keeps. */
const DIGEST_POOL_SIZE = 12
/** How many releases a single group's digest post shows. */
export const MAX_POSTED_GAMES = 5
/** Only games released within this many days qualify. */
const RELEASE_WINDOW_DAYS = 7
/**
 * Steam content-descriptor IDs for sexual / adult content. A weekly digest
 * lands unprompted in a friend group's channel, so these are filtered out.
 * Violence/gore (descriptor 2) is intentionally NOT excluded — it would
 * drop most co-op shooters, which are the point of the feature.
 */
const NSFW_CONTENT_DESCRIPTORS = new Set([1, 3, 4])

/**
 * ISO-8601 week key for a date, e.g. `2026-W20`. Used as the per-group
 * idempotency guard so a given week's digest is posted at most once.
 */
export function currentIsoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // ISO weeks run Monday-Sunday; getUTCDay() is 0 for Sunday.
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Parses Steam's localized `release_date.date`. With the English locale a
 * precise release reads `14 May, 2026`. Anything vaguer (`May 2026`,
 * `Q2 2026`, `Coming soon`) is rejected — we can only window a release we
 * can pin to a day.
 */
export function parseReleaseDate(raw: string | null): Date | null {
  if (!raw) return null
  const match = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/.exec(raw.trim())
  if (!match) return null
  const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} UTC`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Decides whether a Store app belongs in the digest: it must be a released
 * (not coming-soon) game, support co-op or multiplayer, carry no adult
 * content descriptor, and have a parseable release date inside the window.
 */
export function isDigestEligible(
  app: DigestStoreApp,
  now: Date,
): { eligible: boolean; releaseDate: Date | null } {
  if (app.type !== 'game' || app.comingSoon || !app.name) return { eligible: false, releaseDate: null }
  if (!app.isCoop && !app.isMultiplayer) return { eligible: false, releaseDate: null }
  if (app.contentDescriptorIds.some((id) => NSFW_CONTENT_DESCRIPTORS.has(id))) {
    return { eligible: false, releaseDate: null }
  }

  const releaseDate = parseReleaseDate(app.releaseDateRaw)
  if (!releaseDate) return { eligible: false, releaseDate: null }

  const ageMs = now.getTime() - releaseDate.getTime()
  // Allow a 1-day future skew so a release dated "today" in another
  // timezone still counts.
  const withinWindow = ageMs >= -86_400_000 && ageMs <= RELEASE_WINDOW_DAYS * 86_400_000
  return { eligible: withinWindow, releaseDate }
}

// The new-releases list is identical for every group, so it is computed
// once per ISO week and shared. The cache is intentionally NOT populated
// when a Steam outage interrupts a scan with zero results, so a later
// group firing the same week can retry instead of inheriting an empty
// digest.
let weeklyCache: { week: string; games: ReleaseDigestGame[] } | null = null

/** Test-only: drop the shared weekly cache. */
export function resetWeeklyReleasesCache(): void {
  weeklyCache = null
}

/**
 * The week's qualifying co-op / multiplayer releases, newest first. Shared
 * across groups via an in-week cache (per CLAUDE.md: in-memory, no Redis).
 */
export async function getWeeklyReleases(): Promise<ReleaseDigestGame[]> {
  const week = currentIsoWeek()
  if (weeklyCache && weeklyCache.week === week) return weeklyCache.games

  const now = new Date()
  const candidateIds = await getNewReleaseCandidateIds(100)
  const games: ReleaseDigestGame[] = []
  let interrupted = candidateIds.length === 0

  for (const appId of candidateIds) {
    if (games.length >= DIGEST_POOL_SIZE) break

    const app = await getStoreAppForDigest(appId)
    if (app === null) {
      // Store API unavailable — stop, don't hammer a degraded service.
      interrupted = true
      digestLogger.warn({ collected: games.length }, 'releases digest: Store enrichment interrupted')
      break
    }

    const { eligible, releaseDate } = isDigestEligible(app, now)
    if (!eligible || !releaseDate) continue

    games.push({
      steamAppId: app.appId,
      name: app.name,
      headerImageUrl: app.headerImage ?? getHeaderImageUrl(app.appId),
      releaseDate: releaseDate.toISOString().slice(0, 10),
      isCoop: app.isCoop,
      isMultiplayer: app.isMultiplayer,
    })
  }

  games.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))

  // A genuine empty week (scan completed) is cacheable; an outage that
  // produced nothing is not — let the next group retry.
  if (!(interrupted && games.length === 0)) {
    weeklyCache = { week, games }
  }

  digestLogger.info({ week, candidates: candidateIds.length, qualifying: games.length, interrupted }, 'releases digest computed')
  return games
}

interface DigestGroupRow {
  id: string
  name: string
  discord_channel_id: string | null
  discord_webhook_url: string | null
  releases_digest_enabled: boolean
  releases_digest_coop_only: boolean
  releases_digest_last_iso_week: string | null
}

/**
 * Computes and posts the weekly digest for one group. Safe to call from the
 * scheduler tick: it re-validates the group is still eligible, claims the
 * ISO week with an atomic conditional UPDATE (so an overlapping tick or a
 * second backend instance can't double-post), then posts.
 */
export async function runReleasesDigestForGroup(groupId: string): Promise<void> {
  const group: DigestGroupRow | undefined = await db('groups').where({ id: groupId }).first()
  if (!group || !group.releases_digest_enabled) return

  if (!group.discord_channel_id && !group.discord_webhook_url) {
    digestLogger.warn({ groupId }, 'releases digest: enabled but group has no Discord destination')
    return
  }

  const week = currentIsoWeek()
  // Fast path — skip the Steam work entirely if this week is already done.
  if (group.releases_digest_last_iso_week === week) return

  // The digest is a premium feature; re-check at fire time so an owner who
  // downgraded after configuring it stops getting posts.
  const owner = await db('group_members').where({ group_id: groupId, role: 'owner' }).first()
  if (!owner) return
  if (!(await isUserPremium(owner.user_id))) {
    digestLogger.info({ groupId }, 'releases digest: skipped, owner is not premium')
    return
  }

  const releases = await getWeeklyReleases()
  const filtered = group.releases_digest_coop_only ? releases.filter((g) => g.isCoop) : releases
  const top = filtered.slice(0, MAX_POSTED_GAMES)

  // Atomic claim: only the worker that flips last_iso_week to this week
  // proceeds to post. `IS DISTINCT FROM` semantics via whereNull/orWhereNot
  // so a NULL (never posted) row also matches.
  const claimed = await db('groups')
    .where({ id: groupId })
    .where((b) => b.whereNull('releases_digest_last_iso_week').orWhereNot('releases_digest_last_iso_week', week))
    .update({ releases_digest_last_iso_week: week, releases_digest_last_posted_at: db.fn.now() })

  if (claimed === 0) return

  if (top.length === 0) {
    // A quiet Steam week is a real outcome — claim it, post nothing, no spam.
    digestLogger.info({ groupId, week }, 'releases digest: no qualifying releases, nothing posted')
    return
  }

  await notifyReleasesDigest(
    { id: group.id, name: group.name, discordChannelId: group.discord_channel_id, discordWebhookUrl: group.discord_webhook_url },
    top,
  )
  digestLogger.info({ groupId, week, gameCount: top.length }, 'releases digest posted')
}
