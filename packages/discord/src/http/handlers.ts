import type { Client, TextBasedChannel } from 'discord.js'
import type {
  DiscordSessionClosedRequest,
  DiscordSessionCreatedRequest,
  DiscordSessionCreatedResponse,
  DiscordSessionUpdateRequest,
} from '@wawptn/types'
import { buildSessionClosedEmbed, buildSessionEmbed } from '../lib/embeds.js'

/**
 * Handlers live here (separated from the transport layer in server.ts) so
 * they can be unit-tested with a fake Client later without any HTTP noise.
 * Each handler receives an already-parsed, already-authenticated payload.
 */

export class BotHandlerError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

async function resolveSendableChannel(client: Client, channelId: string): Promise<TextBasedChannel> {
  const channel = await client.channels.fetch(channelId).catch(() => null)
  if (!channel) {
    throw new BotHandlerError(404, `Channel ${channelId} not found`)
  }
  if (!channel.isTextBased() || !('send' in channel)) {
    throw new BotHandlerError(400, `Channel ${channelId} is not a sendable text channel`)
  }
  return channel as TextBasedChannel
}

export async function handleSessionCreated(
  client: Client,
  body: DiscordSessionCreatedRequest,
): Promise<DiscordSessionCreatedResponse> {
  const { channelId, sessionId, groupName, creatorName, games, summary } = body

  if (!channelId || !sessionId || !groupName || !Array.isArray(games)) {
    throw new BotHandlerError(400, 'Missing required fields')
  }

  const channel = await resolveSendableChannel(client, channelId)
  const { embeds, components } = buildSessionEmbed({
    groupName,
    creatorName,
    sessionId,
    games,
    summary,
  })

  // `send` exists on guild text/announcement/thread/DM channels — the
  // resolveSendableChannel guard above narrows down to those.
  const sent = await (channel as unknown as { send: (payload: unknown) => Promise<{ id: string }> })
    .send({ embeds, components })

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

  const channel = await resolveSendableChannel(client, channelId)
  // `messages` exists on every TextBasedChannel we care about (Guild text,
  // Announcement, Thread, DM). The narrowing from resolveSendableChannel
  // guarantees it here.
  const messages = (channel as unknown as { messages: { fetch: (id: string) => Promise<unknown> } }).messages
  const message = await messages.fetch(messageId).catch(() => null)
  if (!message) {
    throw new BotHandlerError(404, `Message ${messageId} not found`)
  }

  const { embeds, components } = buildSessionEmbed({
    groupName,
    creatorName,
    sessionId,
    games,
    summary,
  })

  await (message as { edit: (payload: unknown) => Promise<unknown> }).edit({ embeds, components })
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

  const channel = await resolveSendableChannel(client, channelId)
  const messages = (channel as unknown as { messages: { fetch: (id: string) => Promise<unknown> } }).messages
  const message = await messages.fetch(messageId).catch(() => null)
  if (!message) {
    throw new BotHandlerError(404, `Message ${messageId} not found`)
  }

  // Re-materialize the game list from the tallies so the closed embed can
  // show every game row that was in the original message even if we don't
  // re-fetch the source game list.
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

  await (message as { edit: (payload: unknown) => Promise<unknown> }).edit({ embeds, components })
  return { ok: true }
}
