import { db } from '../database/connection.js'
import { logger } from '../logger/logger.js'
import { postSessionUpdate, isBotClientEnabled } from './bot-client.js'
import { buildVoteSummary } from './vote-summary.js'

/**
 * Debounced live-vote updater.
 *
 * Discord's per-message edit rate limit is ~5 edits / 5 s on the same
 * message bucket. To stay under that comfortably without dropping votes,
 * we coalesce every incoming "vote was cast" notification for the same
 * session into a trailing debounce that reads the *current* DB state and
 * pushes it once per window.
 *
 * Two important properties:
 *
 *  1. We always read the latest snapshot from Postgres at flush time, so
 *     web-cast votes and Discord-cast votes end up in the same payload —
 *     no need for the two flows to agree on an incremental shape.
 *  2. A flush failure is logged and retried on the *next* scheduled flush
 *     (driven by the next vote), never a fire-and-forget retry loop,
 *     because the state is canonical in the DB — a missed edit is
 *     self-healing.
 */

const DEBOUNCE_MS = 1_500

interface Pending {
  timer: NodeJS.Timeout
  /** Wall-clock ms when we last started a flush, so trailing-edge
   *  schedules never collapse into rapid-fire edits. */
  lastFlushedAt: number
}

const pending = new Map<string, Pending>()

/**
 * Schedule a trailing-edge update for a session. Safe to call from any code
 * path that persists a vote; the debouncer coalesces them for you.
 */
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

  // Detach the timer so it never keeps the process alive on shutdown.
  timer.unref?.()

  pending.set(sessionId, { timer, lastFlushedAt: existing?.lastFlushedAt ?? 0 })
}

async function flush(sessionId: string): Promise<void> {
  const session = await db('voting_sessions').where({ id: sessionId }).first()
  if (!session) return

  // Nothing to update if the session never got a Discord message (e.g. the
  // group isn't linked to a channel, or the initial post failed).
  if (!session.discord_message_id || !session.discord_channel_id) return

  // Stop updating closed sessions — the close handler already pushed the
  // final state, and further edits would just overwrite the winner embed.
  if (session.status !== 'open') return

  const group = await db('groups').where({ id: session.group_id }).first()
  if (!group) return

  const creator = await db('users').where({ id: session.created_by }).first()
  const summary = await buildVoteSummary(sessionId)

  // Re-materialize the game list in the order the session stored them.
  // We send the full list (not just tallies) because the embed shows game
  // names even for zero-vote games.
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

/**
 * Force-flush all pending updates (used by the close-session path so the
 * last in-flight debounce doesn't race with the final close edit).
 */
export async function flushPending(sessionId: string): Promise<void> {
  const existing = pending.get(sessionId)
  if (!existing) return
  clearTimeout(existing.timer)
  pending.delete(sessionId)
  await flush(sessionId).catch((err) =>
    logger.warn({ error: String(err), sessionId }, 'live-vote-updater: forced flush failed'),
  )
}
