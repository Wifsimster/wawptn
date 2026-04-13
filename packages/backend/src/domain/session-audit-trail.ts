import type { Knex } from 'knex'
import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'

/**
 * Session audit trail domain helper. Centralises writes to
 * `session_audit_trail` so domain code (createVotingSession, closeSession,
 * future per-vote / per-participant events) has a single typed call site.
 *
 * Failures to write are logged but never thrown — audit-log issues must
 * never break the underlying voting flow. Callers that need the row to
 * land atomically with the surrounding write can pass a Knex transaction
 * via `trx`.
 */

/** Allowlist of event identifiers. New events must be added here so the
 * shape of the trail stays predictable for downstream consumers. */
export type SessionAuditEvent =
  | 'session_created'
  | 'session_closed'
  | 'participant_added'
  | 'participant_removed'

interface RecordSessionEventInput {
  /** ID of the voting session this event belongs to. */
  sessionId: string
  /** What happened — must match {@link SessionAuditEvent}. */
  event: SessionAuditEvent
  /** Optional actor (user that triggered the event). Pass null for
   * system-initiated events (auto-vote scheduler, scheduled close). */
  actorId?: string | null
  /** Free-form payload describing the event. Should be small (a few KiB
   * at most) and JSON-serialisable. */
  metadata?: Record<string, unknown>
  /** Optional Knex transaction to pin the insert to a surrounding write
   * (e.g. createVotingSession's atomic check-and-create). */
  trx?: Knex.Transaction
}

/**
 * Insert a single row into `session_audit_trail`. Never throws.
 */
export async function recordSessionEvent(input: RecordSessionEventInput): Promise<void> {
  const { sessionId, event, actorId, metadata, trx } = input
  const conn = trx ?? db
  try {
    await conn('session_audit_trail').insert({
      session_id: sessionId,
      event_type: event,
      actor_id: actorId ?? null,
      metadata: JSON.stringify(metadata ?? {}),
    })
  } catch (error) {
    logger.error(
      { error: String(error), sessionId, event, actorId },
      'failed to write session audit trail entry',
    )
  }
}
