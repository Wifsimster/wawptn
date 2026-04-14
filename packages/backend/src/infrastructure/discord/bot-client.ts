import type {
  DiscordSessionClosedRequest,
  DiscordSessionCreatedRequest,
  DiscordSessionCreatedResponse,
  DiscordSessionUpdateRequest,
} from '@wawptn/types'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

/**
 * HTTP client that talks to the Discord bot's internal API.
 *
 * This module is a thin transport — it does NO business logic, NO debouncing,
 * NO persistence. It is the only place in the backend that knows how the
 * backend ↔ bot wire protocol is shaped, so higher layers (notifier,
 * live-vote-updater) can be swapped or tested without touching the network.
 *
 * The whole module short-circuits to "disabled" when either the URL or the
 * shared secret are missing. Callers don't need to check — they can always
 * call these functions and expect a safe no-op in dev.
 */

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

  // Per-call abort so a hung bot can never stall a vote write. If the caller
  // passed in their own signal we chain the two so both fire.
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

/**
 * Ask the bot to post a new interactive voting message. Returns the message
 * snowflake so the caller can persist it on the voting_session row for
 * later edits. Returns `null` when the client is disabled or the call
 * fails — a Discord post must never be load-bearing for session creation.
 */
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

/**
 * Ask the bot to edit an existing voting message with the current live
 * counts. Errors are logged but never thrown — live updates are best-effort,
 * the canonical tally lives in Postgres.
 */
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

/**
 * Ask the bot to edit the message into its closed state (winner reveal +
 * disabled buttons). Also best-effort: a failure here does not block the
 * session close.
 */
export async function postSessionClosed(payload: DiscordSessionClosedRequest): Promise<void> {
  if (!isBotClientEnabled()) return
  try {
    await postJson('/internal/session/closed', { body: payload })
  } catch (err) {
    logger.warn(
      { error: String(err), sessionId: payload.sessionId, messageId: payload.messageId },
      'bot-client: session/closed failed',
    )
  }
}
