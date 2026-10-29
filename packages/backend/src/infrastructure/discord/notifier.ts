import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import { env } from '../../config/env.js'
import type { VoteResult } from '@wawptn/types'
import { postSessionClosed, postSessionCreated, isBotClientEnabled } from './bot-client.js'
import { buildVoteSummary } from './vote-summary.js'
import { flushPending } from './live-vote-updater.js'

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

  let botHandled = false

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
      await db('voting_sessions').where({ id: sessionId }).update({
        discord_message_id: response.messageId,
        discord_channel_id: group.discord_channel_id,
      })
      logger.info(
        { sessionId, groupId, messageId: response.messageId, channelId: group.discord_channel_id },
        'Discord session message posted',
      )
      botHandled = true
    }
  }

  let webhookPosted = false
  if (!botHandled && group.discord_webhook_url) {
    const gameList = games
      .slice(0, 25)
      .map((g, i) => `**${i + 1}.** ${g.gameName}`)
      .join('\n')

    const voteUrl = `${env.CORS_ORIGIN}/groups/${groupId}/vote`

    await postWebhook(group.discord_webhook_url, {
      embeds: [{
        title: '🎮 Nouvelle session de vote !',
        description: `**${creatorName}** a lancé un vote dans **${group.name}**.\n\n${gameList}\n\n[Votez sur le site](${voteUrl})`,
        color: 0x5865F2,
        url: voteUrl,
        timestamp: new Date().toISOString(),
        thumbnail: games[0]?.headerImageUrl ? { url: games[0].headerImageUrl } : undefined,
      }],
    })
    webhookPosted = true
    logger.info(
      { sessionId, groupId },
      'Discord session webhook posted (fallback)',
    )
  }

  if (!botHandled && !webhookPosted && group.discord_channel_id) {
    logger.warn(
      {
        sessionId,
        groupId,
        channelId: group.discord_channel_id,
        botEnabled: isBotClientEnabled(),
        hasWebhook: !!group.discord_webhook_url,
      },
      'Discord session notification dropped: channel is linked but no transport could post (check DISCORD_BOT_HTTP_URL and bot reachability, or configure a webhook URL)',
    )
  }
}

export async function notifyVoteClosed(
  groupId: string,
  sessionId: string,
  result: VoteResult,
): Promise<void> {
  const group = await db('groups').where({ id: groupId }).first()
  if (!group) return

  let botClosed = false

  if (isBotClientEnabled()) {
    await flushPending(sessionId)

    const session = await db('voting_sessions').where({ id: sessionId }).first()
    if (session?.discord_message_id && session.discord_channel_id) {
      const summary = await buildVoteSummary(sessionId)
      botClosed = await postSessionClosed({
        sessionId,
        groupName: group.name,
        channelId: session.discord_channel_id,
        messageId: session.discord_message_id,
        result,
        summary,
      })
      if (botClosed) {
        logger.info({ sessionId, groupId, messageId: session.discord_message_id }, 'Discord session closed message edited')
      }
    }
  }

  const extraWebhooks: { webhook_url: string }[] = await db('group_announcement_webhooks')
    .where({ group_id: groupId })
    .select('webhook_url')

  const primaryFallback = !botClosed && group.discord_webhook_url
    ? [group.discord_webhook_url]
    : []

  const targets = [
    ...primaryFallback,
    ...extraWebhooks.map((row) => row.webhook_url),
  ]

  if (targets.length === 0) {
    if (!botClosed && group.discord_channel_id) {
      logger.warn(
        {
          sessionId,
          groupId,
          channelId: group.discord_channel_id,
          botEnabled: isBotClientEnabled(),
          hasWebhook: !!group.discord_webhook_url,
        },
        'Discord vote-closed notification dropped: channel is linked but no transport could post (check DISCORD_BOT_HTTP_URL and bot reachability, or configure a webhook URL)',
      )
    }
    return
  }

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

  await Promise.all(targets.map((url) => postWebhook(url, payload)))
}
