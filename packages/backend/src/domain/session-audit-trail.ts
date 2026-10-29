import type { Knex } from 'knex'
import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'

export type SessionAuditEvent =
  | 'session_created'
  | 'session_closed'
  | 'participant_added'
  | 'participant_removed'

interface RecordSessionEventInput {
  sessionId: string
  event: SessionAuditEvent
  actorId?: string | null
  metadata?: Record<string, unknown>
  trx?: Knex.Transaction
}

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
