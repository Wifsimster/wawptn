import type { DiscordEmbedPayload } from '@wawptn/types'
import { logger } from '../logger/logger.js'
import { isBotClientEnabled, postChannelEmbed } from './bot-client.js'

/**
 * Posts a member-initiated "game promotion" into a group's Discord channel:
 * from the "Ma bibliothèque" page a member picks one of their own games and
 * pushes it to a group so they can rally people to play it together ("hey,
 * j'ai ce jeu, qui est chaud ?"). Unlike the new-game spotlight (which fires
 * automatically when a member acquires a game), this is an explicit,
 * on-demand share triggered from the web UI.
 *
 * Mirrors `spotlight-notifier.ts`'s dual-transport posture: a bot-linked
 * channel is served by the bot's generic channel-post endpoint, a
 * webhook-only group by a direct webhook POST. Both are best-effort — a
 * Discord failure is logged, never thrown.
 */

const STEAM_BLUE = 0x66c0f4

export interface PromoteGame {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
}

export interface PromoteGroup {
  id: string
  name: string
  discordChannelId: string | null
  discordWebhookUrl: string | null
}

/**
 * Neutralises Discord mass-mentions in a free-text promotion message so a
 * promoter can't @everyone/@here a whole server or ping arbitrary roles/users
 * through the embed. Pure so it can be unit-tested without Discord.
 */
export function sanitizePromoteMessage(message: string): string {
  return message
    .replace(/@everyone/g, '@​everyone')
    .replace(/@here/g, '@​here')
    .replace(/<@&?\d+>/g, '')
    .slice(0, 500)
}

export function buildPromoteEmbed(
  groupName: string,
  promoterName: string,
  game: PromoteGame,
  message?: string | null,
): DiscordEmbedPayload {
  const trimmed = typeof message === 'string' ? sanitizePromoteMessage(message).trim() : ''
  const intro = `**${promoterName}** propose **${game.gameName}** dans **${groupName}**. Qui est chaud pour jouer ?`
  const description = trimmed ? `${intro}\n\n> ${trimmed}` : intro

  return {
    title: `🎮 ${game.gameName}`,
    description,
    color: STEAM_BLUE,
    url: `https://store.steampowered.com/app/${game.steamAppId}`,
    image: game.headerImageUrl ? { url: game.headerImageUrl } : undefined,
    fields: [
      {
        name: '🚀 Lancer / voir le jeu',
        value:
          `[Ouvrir dans Steam](steam://run/${game.steamAppId}) · ` +
          `[Voir sur le store](https://store.steampowered.com/app/${game.steamAppId})`,
      },
    ],
    footer: { text: 'WAWPTN — Suggestion d’un membre' },
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
      logger.warn({ status: res.status }, 'promote webhook failed')
      return false
    }
    return true
  } catch (error) {
    logger.error({ error: String(error) }, 'promote webhook error')
    return false
  }
}

/**
 * Best-effort post of a member's game promotion. Returns whether any
 * transport accepted the post so the route can report success to the user.
 */
export async function notifyGamePromotion(
  group: PromoteGroup,
  promoterName: string,
  game: PromoteGame,
  message?: string | null,
): Promise<boolean> {
  const embed = buildPromoteEmbed(group.name, promoterName, game, message)
  let delivered = false

  // Primary: bot-backed post into the linked channel.
  if (group.discordChannelId && isBotClientEnabled()) {
    delivered = await postChannelEmbed(group.discordChannelId, [embed])
    if (delivered) {
      logger.info({ groupId: group.id, channelId: group.discordChannelId }, 'game promotion posted via bot')
    }
  }

  // Fallback: direct webhook POST for webhook-only groups (or when the bot
  // post failed and a webhook is also configured).
  if (!delivered && group.discordWebhookUrl) {
    delivered = await postWebhook(group.discordWebhookUrl, embed)
    if (delivered) {
      logger.info({ groupId: group.id }, 'game promotion posted via webhook')
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
      'game promotion dropped: no transport could post (check DISCORD_BOT_HTTP_URL or configure a webhook URL)',
    )
  }

  return delivered
}
