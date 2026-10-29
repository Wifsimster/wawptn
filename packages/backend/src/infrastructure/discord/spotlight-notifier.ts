import type { DiscordEmbedField, DiscordEmbedPayload } from '@wawptn/types'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'
import { isBotClientEnabled, postChannelEmbed } from './bot-client.js'

const STEAM_BLUE = 0x66c0f4

export interface SpotlightGame {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  ownerCount: number
}

export interface SpotlightGroup {
  id: string
  name: string
  discordChannelId: string | null
  discordWebhookUrl: string | null
}

export function ownershipHint(ownerCount: number, memberCount: number): string {
  if (ownerCount >= memberCount && memberCount > 0) {
    return '✅ Tout le monde l’a déjà'
  }
  if (ownerCount <= 1) {
    return `🆕 Personne d’autre ne l’a (0/${memberCount})`
  }
  const others = ownerCount - 1
  return `👥 Déjà chez ${ownerCount}/${memberCount} membres (+${others} en plus de l’acheteur)`
}

export function buildSpotlightEmbed(
  groupName: string,
  ownerName: string,
  memberCount: number,
  games: SpotlightGame[],
): DiscordEmbedPayload {
  const fields: DiscordEmbedField[] = games.map((game, i) => ({
    name: `${i + 1}. ${game.gameName}`.slice(0, 256),
    value:
      `${ownershipHint(game.ownerCount, memberCount)}\n` +
      `[Voir sur Steam](https://store.steampowered.com/app/${game.steamAppId})`,
  }))

  const title = games.length > 1 ? '🎮 Nouveaux jeux à jouer ensemble ?' : '🎮 Un nouveau jeu à jouer ensemble ?'
  const intro =
    games.length > 1
      ? `**${ownerName}** vient d’ajouter ${games.length} jeux à sa ludothèque dans **${groupName}**. Qui veut jouer ?`
      : `**${ownerName}** vient d’ajouter un jeu à sa ludothèque dans **${groupName}**. Qui veut jouer ?`

  return {
    title,
    description: intro,
    color: STEAM_BLUE,
    fields,
    image: games[0]?.headerImageUrl ? { url: games[0].headerImageUrl } : undefined,
    url: `${env.CORS_ORIGIN}/groups`,
    footer: { text: 'WAWPTN — Nouveaux jeux' },
    timestamp: new Date().toISOString(),
  }
}

async function postWebhook(webhookUrl: string, embed: DiscordEmbedPayload): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'spotlight webhook failed')
      return false
    }
    return true
  } catch (error) {
    logger.error({ error: String(error) }, 'spotlight webhook error')
    return false
  }
}

export async function notifyNewGameSpotlight(
  group: SpotlightGroup,
  ownerName: string,
  memberCount: number,
  games: SpotlightGame[],
): Promise<boolean> {
  if (games.length === 0) return false

  const embed = buildSpotlightEmbed(group.name, ownerName, memberCount, games)
  let delivered = false

  if (group.discordChannelId && isBotClientEnabled()) {
    delivered = await postChannelEmbed(group.discordChannelId, [embed])
    if (delivered) {
      logger.info({ groupId: group.id, channelId: group.discordChannelId }, 'new game spotlight posted via bot')
    }
  }

  if (!delivered && group.discordWebhookUrl) {
    delivered = await postWebhook(group.discordWebhookUrl, embed)
    if (delivered) {
      logger.info({ groupId: group.id }, 'new game spotlight posted via webhook')
    }
  }

  if (!delivered) {
    logger.warn(
      {
        groupId: group.id,
        channelId: group.discordChannelId,
        botEnabled: isBotClientEnabled(),
        hasWebhook: !!group.discordWebhookUrl,
      },
      'new game spotlight dropped: no transport could post (check DISCORD_BOT_HTTP_URL or configure a webhook URL)',
    )
  }

  return delivered
}
