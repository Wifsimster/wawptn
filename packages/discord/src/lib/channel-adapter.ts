import type { Client } from 'discord.js'
import { BotHandlerError } from '../http/handlers-error.js'

type SendablePayload = { embeds?: unknown; components?: unknown }

interface SendableChannel {
  send: (payload: SendablePayload) => Promise<{ id: string }>
  messages: { fetch: (id: string) => Promise<EditableMessage | null> }
}

interface EditableMessage {
  edit: (payload: SendablePayload) => Promise<unknown>
}

async function fetchChannel(client: Client, channelId: string): Promise<SendableChannel> {
  const channel = await client.channels.fetch(channelId).catch(() => null)
  if (!channel) {
    throw new BotHandlerError(404, `Channel ${channelId} not found`)
  }
  if (!channel.isTextBased() || !('send' in channel)) {
    throw new BotHandlerError(400, `Channel ${channelId} is not a sendable text channel`)
  }
  return channel as unknown as SendableChannel
}

export async function sendMessage(
  client: Client,
  channelId: string,
  payload: SendablePayload
): Promise<{ id: string }> {
  const channel = await fetchChannel(client, channelId)
  return channel.send(payload)
}

export async function editMessage(
  client: Client,
  channelId: string,
  messageId: string,
  payload: SendablePayload
): Promise<void> {
  const channel = await fetchChannel(client, channelId)
  const message = await channel.messages.fetch(messageId).catch(() => null)
  if (!message) {
    throw new BotHandlerError(404, `Message ${messageId} not found`)
  }
  await message.edit(payload)
}
