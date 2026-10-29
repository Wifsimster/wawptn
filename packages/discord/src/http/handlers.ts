import type { Client } from 'discord.js'
import type {
  DiscordChannelPostRequest,
  DiscordChannelPostResponse,
  DiscordSessionClosedRequest,
  DiscordSessionCreatedRequest,
  DiscordSessionCreatedResponse,
  DiscordSessionUpdateRequest,
} from '@wawptn/types'
import { buildSessionClosedEmbed, buildSessionEmbed } from '../lib/embeds.js'
import { sendMessage, editMessage } from '../lib/channel-adapter.js'
import { BotHandlerError } from './handlers-error.js'

export { BotHandlerError }

export async function handleSessionCreated(
  client: Client,
  body: DiscordSessionCreatedRequest,
): Promise<DiscordSessionCreatedResponse> {
  const { channelId, sessionId, groupName, creatorName, games, summary } = body

  if (!channelId || !sessionId || !groupName || !Array.isArray(games)) {
    throw new BotHandlerError(400, 'Missing required fields')
  }

  const { embeds, components } = buildSessionEmbed({
    groupName,
    creatorName,
    sessionId,
    games,
    summary,
  })

  const sent = await sendMessage(client, channelId, { embeds, components })
  return { messageId: sent.id }
}

export async function handleSessionUpdate(
  client: Client,
  body: DiscordSessionUpdateRequest,
): Promise<{ ok: true }> {
  const { channelId, messageId, sessionId, groupName, creatorName, games, summary } = body

  if (!channelId || !messageId || !sessionId) {
    throw new BotHandlerError(400, 'Missing required fields')
  }

  const { embeds, components } = buildSessionEmbed({
    groupName,
    creatorName,
    sessionId,
    games,
    summary,
  })

  await editMessage(client, channelId, messageId, { embeds, components })
  return { ok: true }
}

export async function handleSessionClosed(
  client: Client,
  body: DiscordSessionClosedRequest,
): Promise<{ ok: true }> {
  const { channelId, messageId, sessionId, groupName, result, summary } = body

  if (!channelId || !messageId || !sessionId || !result) {
    throw new BotHandlerError(400, 'Missing required fields')
  }

  if (!summary || !Array.isArray(summary.tallies)) {
    throw new BotHandlerError(400, 'Missing or invalid summary.tallies')
  }

  const games = summary.tallies.map((t) => ({
    steamAppId: t.steamAppId,
    gameName: t.gameName,
    headerImageUrl: t.headerImageUrl,
  }))

  const { embeds, components } = buildSessionClosedEmbed({
    groupName,
    sessionId,
    games,
    result,
    summary,
  })

  await editMessage(client, channelId, messageId, { embeds, components })
  return { ok: true }
}

export async function handleChannelPost(
  client: Client,
  body: DiscordChannelPostRequest,
): Promise<DiscordChannelPostResponse> {
  const { channelId, embeds } = body

  if (!channelId || !Array.isArray(embeds) || embeds.length === 0) {
    throw new BotHandlerError(400, 'channelId and a non-empty embeds array are required')
  }

  const sent = await sendMessage(client, channelId, { embeds })
  return { messageId: sent.id }
}
