import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import { postSessionUpdate, isBotClientEnabled } from './bot-client.js'
import { buildVoteSummary } from './vote-summary.js'

const DEBOUNCE_MS = 1_500

interface Pending {
  timer: NodeJS.Timeout
  lastFlushedAt: number
}

const pending = new Map<string, Pending>()

export function scheduleVoteUpdate(sessionId: string): void {
  if (!isBotClientEnabled()) return

  const existing = pending.get(sessionId)
  if (existing) {
    clearTimeout(existing.timer)
  }

  const timer = setTimeout(() => {
    pending.delete(sessionId)
    flush(sessionId).catch((err) =>
      logger.warn({ error: String(err), sessionId }, 'live-vote-updater: flush failed'),
    )
  }, DEBOUNCE_MS)

  timer.unref?.()

  pending.set(sessionId, { timer, lastFlushedAt: existing?.lastFlushedAt ?? 0 })
}

async function flush(sessionId: string): Promise<void> {
  const session = await db('voting_sessions').where({ id: sessionId }).first()
  if (!session) return

  if (!session.discord_message_id || !session.discord_channel_id) return

  if (session.status !== 'open') return

  const group = await db('groups').where({ id: session.group_id }).first()
  if (!group) return

  const creator = await db('users').where({ id: session.created_by }).first()
  const summary = await buildVoteSummary(sessionId)

  const games = summary.tallies.map((t) => ({
    steamAppId: t.steamAppId,
    gameName: t.gameName,
    headerImageUrl: t.headerImageUrl,
  }))

  await postSessionUpdate({
    sessionId,
    groupName: group.name,
    channelId: session.discord_channel_id,
    messageId: session.discord_message_id,
    creatorName: creator?.display_name ?? 'Un membre',
    games,
    summary,
  })
}

export async function flushPending(sessionId: string): Promise<void> {
  const existing = pending.get(sessionId)
  if (!existing) return
  clearTimeout(existing.timer)
  pending.delete(sessionId)
  await flush(sessionId).catch((err) =>
    logger.warn({ error: String(err), sessionId }, 'live-vote-updater: forced flush failed'),
  )
}
