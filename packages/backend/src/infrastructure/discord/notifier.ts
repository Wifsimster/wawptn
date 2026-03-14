import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import type { VoteResult } from '@wawptn/types'

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
  if (!group?.discord_webhook_url) return

  const creator = await db('voting_sessions')
    .join('users', 'voting_sessions.created_by', 'users.id')
    .where({ 'voting_sessions.id': sessionId })
    .select('users.display_name')
    .first()

  const gameList = games
    .slice(0, 25)
    .map((g, i) => `**${i + 1}.** ${g.gameName}`)
    .join('\n')

  await postWebhook(group.discord_webhook_url, {
    embeds: [{
      title: '🎮 Nouvelle session de vote !',
      description: `**${creator?.display_name || 'Un membre'}** a lancé un vote dans **${group.name}**.\n\n${gameList}\n\nVotez sur le site ou utilisez les boutons Discord !`,
      color: 0x5865F2,
      timestamp: new Date().toISOString(),
      thumbnail: games[0]?.headerImageUrl ? { url: games[0].headerImageUrl } : undefined,
    }],
  })
}

export async function notifyVoteClosed(
  groupId: string,
  result: VoteResult,
): Promise<void> {
  const group = await db('groups').where({ id: groupId }).first()
  if (!group?.discord_webhook_url) return

  await postWebhook(group.discord_webhook_url, {
    embeds: [{
      title: '🏆 Résultat du vote !',
      description: `Le groupe **${group.name}** a choisi :\n\n# ${result.gameName}`,
      color: 0x57F287,
      fields: [
        { name: 'Votes pour', value: `${result.yesCount}`, inline: true },
        { name: 'Votants', value: `${result.totalVoters}`, inline: true },
      ],
      image: result.headerImageUrl ? { url: result.headerImageUrl } : undefined,
      url: result.steamAppId ? `https://store.steampowered.com/app/${result.steamAppId}` : undefined,
      timestamp: new Date().toISOString(),
    }],
  })
}
