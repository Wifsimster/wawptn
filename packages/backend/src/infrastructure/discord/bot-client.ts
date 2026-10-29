import type {
  DiscordChannelPostRequest,
  DiscordEmbedPayload,
  DiscordSessionClosedRequest,
  DiscordSessionCreatedRequest,
  DiscordSessionCreatedResponse,
  DiscordSessionUpdateRequest,
} from '@wawptn/types'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

const REQUEST_TIMEOUT_MS = 5_000

export function isBotClientEnabled(): boolean {
  return !!env.DISCORD_BOT_HTTP_URL && !!env.DISCORD_BOT_API_SECRET
}

interface FetchOptions {
  body: unknown
  signal?: AbortSignal
}

async function postJson<T>(path: string, options: FetchOptions): Promise<T> {
  const url = `${env.DISCORD_BOT_HTTP_URL}${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_API_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`bot API ${path} returned ${res.status}: ${text.slice(0, 200)}`)
    }

    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

export async function postSessionCreated(
  payload: DiscordSessionCreatedRequest,
): Promise<DiscordSessionCreatedResponse | null> {
  if (!isBotClientEnabled()) return null
  try {
    return await postJson<DiscordSessionCreatedResponse>('/internal/session/created', {
      body: payload,
    })
  } catch (err) {
    logger.warn(
      { error: String(err), sessionId: payload.sessionId, channelId: payload.channelId },
      'bot-client: session/created failed',
    )
    return null
  }
}

export async function postSessionUpdate(payload: DiscordSessionUpdateRequest): Promise<void> {
  if (!isBotClientEnabled()) return
  try {
    await postJson('/internal/session/updated', { body: payload })
  } catch (err) {
    logger.warn(
      { error: String(err), sessionId: payload.sessionId, messageId: payload.messageId },
      'bot-client: session/updated failed',
    )
  }
}

export async function postSessionClosed(payload: DiscordSessionClosedRequest): Promise<boolean> {
  if (!isBotClientEnabled()) return false
  try {
    await postJson('/internal/session/closed', { body: payload })
    return true
  } catch (err) {
    logger.warn(
      { error: String(err), sessionId: payload.sessionId, messageId: payload.messageId },
      'bot-client: session/closed failed',
    )
    return false
  }
}

export async function postChannelEmbed(channelId: string, embeds: DiscordEmbedPayload[]): Promise<boolean> {
  if (!isBotClientEnabled()) return false
  const body: DiscordChannelPostRequest = { channelId, embeds }
  try {
    await postJson('/internal/channel/post', { body })
    return true
  } catch (err) {
    logger.warn({ error: String(err), channelId }, 'bot-client: channel/post failed')
    return false
  }
}
