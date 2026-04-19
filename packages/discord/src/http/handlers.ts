import type { Client } from 'discord.js'
import type {
  DiscordSessionClosedRequest,
  DiscordSessionCreatedRequest,
  DiscordSessionCreatedResponse,
  DiscordSessionUpdateRequest,
} from '@wawptn/types'
import { buildSessionClosedEmbed, buildSessionEmbed } from '../lib/embeds.js'
import { sendMessage, editMessage } from '../lib/channel-adapter.js'
import { BotHandlerError } from './handlers-error.js'

/**
 * Handlers live here (separated from the transport layer in server.ts) so
 * they can be unit-tested with a fake Client later without any HTTP noise.
 * Each handler receives an already-parsed, already-authenticated payload.
 */

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

  await editMessage(client, channelId, messageId, { embeds, components })
  return { ok: true }
}
