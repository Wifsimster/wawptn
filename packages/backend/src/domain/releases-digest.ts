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

const DIGEST_POOL_SIZE = 12
export const MAX_POSTED_GAMES = 5
const RELEASE_WINDOW_DAYS = 7
const NSFW_CONTENT_DESCRIPTORS = new Set([1, 3, 4])

export function currentIsoWeek(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function parseReleaseDate(raw: string | null): Date | null {
  if (!raw) return null
  const match = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/.exec(raw.trim())
  if (!match) return null
  const parsed = new Date(`${match[1]} ${match[2]} ${match[3]} UTC`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

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
  const withinWindow = ageMs >= -86_400_000 && ageMs <= RELEASE_WINDOW_DAYS * 86_400_000
  return { eligible: withinWindow, releaseDate }
}

let weeklyCache: { week: string; games: ReleaseDigestGame[] } | null = null

export function resetWeeklyReleasesCache(): void {
  weeklyCache = null
}

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

export async function runReleasesDigestForGroup(groupId: string): Promise<void> {
  const group: DigestGroupRow | undefined = await db('groups').where({ id: groupId }).first()
  if (!group || !group.releases_digest_enabled) return

  if (!group.discord_channel_id && !group.discord_webhook_url) {
    digestLogger.warn({ groupId }, 'releases digest: enabled but group has no Discord destination')
    return
  }

  const week = currentIsoWeek()
  if (group.releases_digest_last_iso_week === week) return

  const owner = await db('group_members').where({ group_id: groupId, role: 'owner' }).first()
  if (!owner) return
  if (!(await isUserPremium(owner.user_id))) {
    digestLogger.info({ groupId }, 'releases digest: skipped, owner is not premium')
    return
  }

  const releases = await getWeeklyReleases()
  const filtered = group.releases_digest_coop_only ? releases.filter((g) => g.isCoop) : releases
  const top = filtered.slice(0, MAX_POSTED_GAMES)

  const claimed = await db('groups')
    .where({ id: groupId })
    .where((b) => b.whereNull('releases_digest_last_iso_week').orWhereNot('releases_digest_last_iso_week', week))
    .update({ releases_digest_last_iso_week: week, releases_digest_last_posted_at: db.fn.now() })

  if (claimed === 0) return

  if (top.length === 0) {
    digestLogger.info({ groupId, week }, 'releases digest: no qualifying releases, nothing posted')
    return
  }

  await notifyReleasesDigest(
    { id: group.id, name: group.name, discordChannelId: group.discord_channel_id, discordWebhookUrl: group.discord_webhook_url },
    top,
  )
  digestLogger.info({ groupId, week, gameCount: top.length }, 'releases digest posted')
}
