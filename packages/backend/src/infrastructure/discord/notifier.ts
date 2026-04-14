import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import type { VoteResult } from '@wawptn/types'
import { postSessionClosed, postSessionCreated, isBotClientEnabled } from './bot-client.js'
import { buildVoteSummary } from './vote-summary.js'
import { flushPending } from './live-vote-updater.js'

/**
 * High-level Discord notifications for voting sessions.
 *
 * This module is the session-effects facade into Discord: all
 * `session:created` / `session:closed` side effects flow through here.
 * Two transports are layered:
 *
 *  1. **Bot-backed interactive messages** (primary channel). Uses the
 *     Discord.js bot via the internal HTTP API so we can send, edit, and
 *     close messages with interactive buttons. Required for Discord-side
 *     voting.
 *  2. **Announcement webhooks** (broadcast channels). Legacy plain-text
 *     embeds pushed to every `group_announcement_webhooks` row so votes
 *     announce into #general etc. No buttons — webhooks can't carry them.
 *
 * Both transports are best-effort: a Discord failure never blocks the
 * canonical vote record in Postgres.
 */

interface WebhookEmbed {
  title: string
  description: string
  color: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  image?: { url: string }
  thumbnail?: { url: string }
  timestamp?: string
  url?: string
}

async function postWebhook(webhookUrl: string, payload: { embeds: WebhookEmbed[] }): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      logger.warn({ status: res.status, webhookUrl: webhookUrl.slice(0, 50) }, 'Discord webhook failed')
    }
  } catch (error) {
    logger.error({ error: String(error) }, 'Discord webhook error')
  }
}

interface SessionGame {
  gameName: string
  steamAppId: number
  headerImageUrl: string | null
}

export async function notifySessionCreated(
  groupId: string,
  sessionId: string,
  games: SessionGame[],
): Promise<void> {
  const group = await db('groups').where({ id: groupId }).first()
  if (!group) return

  const creator = await db('voting_sessions')
    .join('users', 'voting_sessions.created_by', 'users.id')
    .where({ 'voting_sessions.id': sessionId })
    .select('users.display_name')
    .first()

  const creatorName = creator?.display_name || 'Un membre'

  // ── Primary: bot-backed interactive message ─────────────────────────
  // Requires a linked channel AND the bot HTTP URL configured. When
  // either is missing we silently fall back to webhook-only mode.
  if (group.discord_channel_id && isBotClientEnabled()) {
    const summary = await buildVoteSummary(sessionId)
    const response = await postSessionCreated({
      sessionId,
      groupId,
      groupName: group.name,
      channelId: group.discord_channel_id,
      creatorName,
      games: games.map((g) => ({
        steamAppId: g.steamAppId,
        gameName: g.gameName,
        headerImageUrl: g.headerImageUrl,
      })),
      summary,
    })

    if (response?.messageId) {
      // Persist the returned message ID so later edits (live vote counts,
      // close reveal) can target the same message. Also cache the channel
      // ID on the session so a later re-link of the group's channel
      // doesn't orphan in-flight messages.
      await db('voting_sessions').where({ id: sessionId }).update({
        discord_message_id: response.messageId,
        discord_channel_id: group.discord_channel_id,
      })
      logger.info(
        { sessionId, groupId, messageId: response.messageId, channelId: group.discord_channel_id },
        'Discord session message posted',
      )
    }
  }

  // ── Fallback: legacy primary webhook ────────────────────────────────
  // Only used when there is NO linked bot channel. Kept so groups that
  // configured a webhook URL pre-bot continue to receive notifications.
  if (!group.discord_channel_id && group.discord_webhook_url) {
    const gameList = games
      .slice(0, 25)
      .map((g, i) => `**${i + 1}.** ${g.gameName}`)
      .join('\n')

    await postWebhook(group.discord_webhook_url, {
      embeds: [{
        title: '🎮 Nouvelle session de vote !',
        description: `**${creatorName}** a lancé un vote dans **${group.name}**.\n\n${gameList}\n\nVotez sur le site !`,
        color: 0x5865F2,
        timestamp: new Date().toISOString(),
        thumbnail: games[0]?.headerImageUrl ? { url: games[0].headerImageUrl } : undefined,
      }],
    })
  }
}

export async function notifyVoteClosed(
  groupId: string,
  sessionId: string,
  result: VoteResult,
): Promise<void> {
  const group = await db('groups').where({ id: groupId }).first()
  if (!group) return

  // ── Primary: edit the bot's interactive message into closed state ───
  if (isBotClientEnabled()) {
    // Make sure any in-flight debounced live update lands BEFORE we push
    // the closed-state edit, so we don't race and overwrite the winner.
    await flushPending(sessionId)

    const session = await db('voting_sessions').where({ id: sessionId }).first()
    if (session?.discord_message_id && session.discord_channel_id) {
      const summary = await buildVoteSummary(sessionId)
      await postSessionClosed({
        sessionId,
        groupName: group.name,
        channelId: session.discord_channel_id,
        messageId: session.discord_message_id,
        result,
        summary,
      })
    }
  }

  // ── Extra announcement webhooks broadcast ───────────────────────────
  // Separate list managed via POST /api/discord/announcements. Used to
  // fan out the winner to #general/#announcements channels beyond the
  // primary. Webhooks cannot carry interactive buttons, so these are
  // always plain embeds.
  const extraWebhooks: { webhook_url: string }[] = await db('group_announcement_webhooks')
    .where({ group_id: groupId })
    .select('webhook_url')

  // When the group has no linked channel we also want the legacy
  // primary webhook (if set) to receive the result — otherwise it is
  // skipped because the bot already posted a closed state above.
  const primaryFallback = !group.discord_channel_id && group.discord_webhook_url
    ? [group.discord_webhook_url]
    : []

  const targets = [
    ...primaryFallback,
    ...extraWebhooks.map((row) => row.webhook_url),
  ]

  if (targets.length === 0) return

  const fields = [
    { name: 'Votes pour', value: `${result.yesCount}`, inline: true },
    { name: 'Votants', value: `${result.totalVoters}`, inline: true },
  ]

  if (result.steamAppId) {
    fields.push({
      name: '🚀 Lancer sur Steam',
      value: `[Ouvrir dans Steam](steam://run/${result.steamAppId})`,
      inline: false,
    })
  }

  const payload = {
    embeds: [{
      title: '🏆 Résultat du vote !',
      description: `Le groupe **${group.name}** a choisi :\n\n# ${result.gameName}`,
      color: 0x57F287,
      fields,
      image: result.headerImageUrl ? { url: result.headerImageUrl } : undefined,
      url: result.steamAppId ? `https://store.steampowered.com/app/${result.steamAppId}` : undefined,
      timestamp: new Date().toISOString(),
    }],
  }

  // Fire webhooks in parallel. postWebhook swallows its own errors so one
  // broken webhook cannot prevent the others from delivering.
  await Promise.all(targets.map((url) => postWebhook(url, payload)))
}
