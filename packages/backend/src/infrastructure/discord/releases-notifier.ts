import type { DiscordEmbedField, DiscordEmbedPayload, ReleaseDigestGame } from '@wawptn/types'
import { logger } from '../logger/logger.js'
import { isBotClientEnabled, postChannelEmbed } from './bot-client.js'

/**
 * Posts the weekly Steam new-releases digest into a group's Discord.
 *
 * Mirrors `notifier.ts`'s dual-transport posture: a bot-linked channel is
 * served by the bot's generic channel-post endpoint, a webhook-only group
 * by a direct webhook POST. Both transports are best-effort — a Discord
 * failure is logged, never thrown, since the digest is a non-critical
 * scheduled announcement.
 */

const STEAM_BLUE = 0x66c0f4

interface DigestGroup {
  id: string
  name: string
  discordChannelId: string | null
  discordWebhookUrl: string | null
}

function buildDigestEmbed(groupName: string, games: ReleaseDigestGame[]): DiscordEmbedPayload {
  const fields: DiscordEmbedField[] = games.map((game, i) => {
    const tags: string[] = []
    if (game.isCoop) tags.push('Coop')
    if (game.isMultiplayer) tags.push('Multijoueur')
    const released = new Date(`${game.releaseDate}T00:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
    return {
      name: `${i + 1}. ${game.name}`.slice(0, 256),
      value:
        `📅 Sortie le ${released} · 🎮 ${tags.join(' · ')}\n` +
        `[Voir sur Steam](https://store.steampowered.com/app/${game.steamAppId})`,
    }
  })

  return {
    title: '🆕 Nouveautés Steam de la semaine',
    description: `Les sorties co-op et multijoueur les plus récentes pour **${groupName}**.`,
    color: STEAM_BLUE,
    fields,
    image: games[0] ? { url: games[0].headerImageUrl } : undefined,
    footer: { text: 'WAWPTN — Nouveautés Steam' },
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
      logger.warn({ status: res.status }, 'releases digest webhook failed')
      return false
    }
    return true
  } catch (error) {
    logger.error({ error: String(error) }, 'releases digest webhook error')
    return false
  }
}

export async function notifyReleasesDigest(group: DigestGroup, games: ReleaseDigestGame[]): Promise<void> {
  if (games.length === 0) return

  const embed = buildDigestEmbed(group.name, games)
  let delivered = false

  // Primary: bot-backed post into the linked channel.
  if (group.discordChannelId && isBotClientEnabled()) {
    delivered = await postChannelEmbed(group.discordChannelId, [embed])
    if (delivered) {
      logger.info({ groupId: group.id, channelId: group.discordChannelId }, 'releases digest posted via bot')
    }
  }

  // Fallback: direct webhook POST for webhook-only groups (or when the bot
  // post failed and a webhook is also configured).
  if (!delivered && group.discordWebhookUrl) {
    delivered = await postWebhook(group.discordWebhookUrl, embed)
    if (delivered) {
      logger.info({ groupId: group.id }, 'releases digest posted via webhook')
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
      'releases digest dropped: no transport could post (check DISCORD_BOT_HTTP_URL or configure a webhook URL)',
    )
  }
}

/**
 * Posts a one-off test message into a group's Discord. Used by the digest
 * settings dialog so an owner can confirm the channel link works before
 * relying on the weekly schedule. Uses the same dual-transport posture as
 * `notifyReleasesDigest` and returns whether Discord accepted the post so
 * the caller can surface success or failure to the owner.
 */
export async function notifyReleasesDigestTest(group: DigestGroup): Promise<boolean> {
  const embed: DiscordEmbedPayload = {
    title: '🧪 Test — Nouveautés Steam',
    description:
      `Ceci est un message de test pour **${group.name}**.\n` +
      "Si tu vois ce message, le digest hebdomadaire des nouveautés Steam est bien relié à ce salon.",
    color: STEAM_BLUE,
    footer: { text: 'WAWPTN — Nouveautés Steam' },
    timestamp: new Date().toISOString(),
  }

  let delivered = false

  if (group.discordChannelId && isBotClientEnabled()) {
    delivered = await postChannelEmbed(group.discordChannelId, [embed])
    if (delivered) {
      logger.info({ groupId: group.id, channelId: group.discordChannelId }, 'releases digest test posted via bot')
    }
  }

  if (!delivered && group.discordWebhookUrl) {
    delivered = await postWebhook(group.discordWebhookUrl, embed)
    if (delivered) {
      logger.info({ groupId: group.id }, 'releases digest test posted via webhook')
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
      'releases digest test dropped: no transport could post',
    )
  }

  return delivered
}
