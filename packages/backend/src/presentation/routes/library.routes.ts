import { Router, type Request, type Response } from 'express'
import type { LibraryGame, PromoteTarget } from '@wawptn/types'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { triggerBackgroundEnrichment } from '../../infrastructure/steam/steam-store-client.js'
import { notifyGamePromotion } from '../../infrastructure/discord/promote-notifier.js'

/**
 * "Ma bibliothèque" — the authenticated user's own Steam library, plus the
 * ability to promote one of those games into a group's Discord channel so
 * they can rally people to play it.
 *
 * Scoped to Steam titles: they carry a steam_app_id (header image + store
 * link), which is what the cards and the Discord embed both need. Epic/GOG
 * rows are synced without a steam_app_id and are intentionally excluded here.
 */

const router = Router()

const MAX_LIBRARY_RESULTS = 2000
const VALID_SORTS = new Set(['playtime', 'name', 'recent'])

// Lightweight in-memory rate limit for promotions so a member can't spam a
// group's Discord channel. Keyed per user; the canonical concern is outbound
// Discord posts, not DB writes (there are none).
const promoteRateLimits = new Map<string, { count: number; resetAt: number }>()
const PROMOTE_LIMIT = 10
const PROMOTE_WINDOW_MS = 10 * 60 * 1000

// List the authenticated user's Steam games, optionally filtered by a search
// query and sorted. Enriched via a left-join to game_metadata for the card
// hover details (description, metacritic, controller support).
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim().slice(0, 100) : ''
    const sortParam = typeof req.query['sort'] === 'string' ? req.query['sort'] : 'playtime'
    const sort = VALID_SORTS.has(sortParam) ? sortParam : 'playtime'

    let query = db('user_games')
      .leftJoin('game_metadata', 'user_games.steam_app_id', 'game_metadata.steam_app_id')
      .where({ 'user_games.user_id': userId, 'user_games.platform': 'steam' })
      .whereNotNull('user_games.steam_app_id')

    if (q) {
      query = query.whereRaw('user_games.game_name ILIKE ?', [`%${q}%`])
    }

    if (sort === 'name') {
      query = query.orderBy('user_games.game_name', 'asc')
    } else if (sort === 'recent') {
      query = query.orderByRaw('user_games.playtime_2weeks DESC NULLS LAST')
        .orderByRaw('user_games.playtime_forever DESC NULLS LAST')
    } else {
      query = query.orderByRaw('user_games.playtime_forever DESC NULLS LAST')
        .orderBy('user_games.game_name', 'asc')
    }

    const rows = await query
      .limit(MAX_LIBRARY_RESULTS)
      .select(
        'user_games.steam_app_id as steamAppId',
        'user_games.game_id as gameId',
        'user_games.game_name as gameName',
        'user_games.header_image_url as headerImageUrl',
        'user_games.playtime_forever as playtimeForever',
        'user_games.playtime_2weeks as playtime2weeks',
        'game_metadata.short_description as shortDescription',
        'game_metadata.metacritic_score as metacriticScore',
        'game_metadata.is_free as isFree',
        'game_metadata.controller_support as controllerSupport',
      )

    // Total count (unfiltered) so the UI can show "X jeux" for the library.
    const totalRow = await db('user_games')
      .where({ user_id: userId, platform: 'steam' })
      .whereNotNull('steam_app_id')
      .count<{ count: string }[]>('* as count')
      .first()

    // Best-effort background enrichment for the games currently on screen so
    // hover details fill in on a later visit. Mirrors the common-games path.
    const appIds = rows.map((g: { steamAppId: number }) => g.steamAppId)
    if (appIds.length > 0) {
      triggerBackgroundEnrichment(appIds.slice(0, 100))
    }

    const games: LibraryGame[] = rows.map((g: Record<string, unknown>) => ({
      steamAppId: g.steamAppId as number,
      gameId: (g.gameId as string | null) ?? undefined,
      gameName: g.gameName as string,
      headerImageUrl: (g.headerImageUrl as string | null) ?? null,
      playtimeForever: g.playtimeForever != null ? Number(g.playtimeForever) : null,
      playtime2weeks: g.playtime2weeks != null ? Number(g.playtime2weeks) : null,
      shortDescription: (g.shortDescription as string | null) ?? null,
      metacriticScore: g.metacriticScore != null ? Number(g.metacriticScore) : null,
      isFree: (g.isFree as boolean | null) ?? null,
      controllerSupport: (g.controllerSupport as string | null) ?? null,
    }))

    res.json({ games, total: Number(totalRow?.count ?? games.length) })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to load user library')
    res.status(500).json({ error: 'internal', message: 'Failed to load library' })
  }
})

// Groups the user belongs to that have a Discord destination configured, so
// the promote dialog can offer them as targets. A group qualifies if it has
// either a linked bot channel or a webhook URL.
router.get('/promote-targets', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!

    const rows = await db('group_members')
      .join('groups', 'group_members.group_id', 'groups.id')
      .where({ 'group_members.user_id': userId })
      .where(function () {
        this.whereNotNull('groups.discord_channel_id').orWhereNotNull('groups.discord_webhook_url')
      })
      .orderBy('groups.name', 'asc')
      .select(
        'groups.id as groupId',
        'groups.name as groupName',
        'groups.discord_guild_name as discordGuildName',
        'groups.discord_channel_name as discordChannelName',
        'groups.discord_channel_id as discordChannelId',
      )

    const groups: PromoteTarget[] = rows.map((r: Record<string, unknown>) => ({
      groupId: r.groupId as string,
      groupName: r.groupName as string,
      discordGuildName: (r.discordGuildName as string | null) ?? null,
      discordChannelName: (r.discordChannelName as string | null) ?? null,
      hasChannel: r.discordChannelId != null,
    }))

    res.json({ groups })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to load promote targets')
    res.status(500).json({ error: 'internal', message: 'Failed to load groups' })
  }
})

// Promote a game from the user's library into a group's Discord channel.
router.post('/promote', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const { steamAppId, groupId, message } = req.body as {
      steamAppId?: number
      groupId?: string
      message?: string
    }

    if (typeof steamAppId !== 'number' || !Number.isInteger(steamAppId) || steamAppId <= 0 || !groupId) {
      res.status(400).json({ error: 'validation', message: 'steamAppId and groupId are required' })
      return
    }
    if (message !== undefined && (typeof message !== 'string' || message.length > 500)) {
      res.status(400).json({ error: 'validation', message: 'message must be a string of at most 500 characters' })
      return
    }

    // The promoted game must actually be in the caller's Steam library — this
    // is both an ownership check and how we resolve the canonical name/image.
    const game = await db('user_games')
      .where({ user_id: userId, steam_app_id: steamAppId, platform: 'steam' })
      .first()
    if (!game) {
      res.status(404).json({ error: 'not_found', message: 'Ce jeu n\'est pas dans votre bibliothèque' })
      return
    }

    // The caller must be a member of the target group.
    const membership = await db('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()
    if (!membership) {
      res.status(403).json({ error: 'forbidden', message: 'Vous n\'êtes pas membre de ce groupe' })
      return
    }

    const group = await db('groups').where({ id: groupId }).first()
    if (!group) {
      res.status(404).json({ error: 'not_found', message: 'Groupe introuvable' })
      return
    }

    if (!group.discord_channel_id && !group.discord_webhook_url) {
      res.status(422).json({
        error: 'no_discord',
        message: 'Ce groupe n\'a pas de canal Discord configuré.',
      })
      return
    }

    // Rate limit outbound promotions per user.
    const now = Date.now()
    const limit = promoteRateLimits.get(userId)
    if (limit && now < limit.resetAt) {
      if (limit.count >= PROMOTE_LIMIT) {
        res.status(429).json({
          error: 'rate_limited',
          message: 'Vous avez partagé trop de jeux récemment. Réessayez dans quelques minutes.',
        })
        return
      }
      limit.count++
    } else {
      promoteRateLimits.set(userId, { count: 1, resetAt: now + PROMOTE_WINDOW_MS })
    }

    const user = await db('users').where({ id: userId }).first()
    const promoterName = user?.display_name || user?.steam_persona_name || 'Un membre'

    const delivered = await notifyGamePromotion(
      {
        id: group.id,
        name: group.name,
        discordChannelId: group.discord_channel_id ?? null,
        discordWebhookUrl: group.discord_webhook_url ?? null,
      },
      promoterName,
      {
        steamAppId,
        gameName: game.game_name,
        headerImageUrl: game.header_image_url ?? null,
      },
      message,
    )

    if (!delivered) {
      res.status(502).json({
        error: 'discord_unreachable',
        message: 'Impossible de poster sur Discord pour le moment. Réessayez plus tard.',
      })
      return
    }

    logger.info({ userId, groupId, steamAppId }, 'game promoted to Discord')
    res.json({ ok: true, delivered: true })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to promote game')
    res.status(500).json({ error: 'internal', message: 'Failed to promote game' })
  }
})

export { router as libraryRoutes }
