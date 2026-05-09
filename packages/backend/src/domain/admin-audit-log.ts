import type { Request } from 'express'
import type { Knex } from 'knex'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'

/**
 * Admin audit log domain service.
 *
 * Centralises writes to the `admin_audit_log` table so route handlers have
 * a single, well-typed call site for recording privileged actions.
 *
 * Failures to write the audit log are logged but never thrown — we never want
 * audit-log issues to break a legitimate admin action. Call sites that need
 * stronger guarantees should wrap the action and the log call in a transaction.
 */

/** Allowlist of action identifiers. New actions must be added here so the
 * shape of the audit log stays predictable for downstream consumers. */
export type AdminAuditAction =
  | 'user.admin.grant'
  | 'user.admin.revoke'
  | 'user.premium.grant'
  | 'user.premium.revoke'
  | 'persona.create'
  | 'persona.update'
  | 'persona.delete'
  | 'persona.toggle'
  | 'bot_settings.update'
  | 'games.dedupe'
  | 'email.test'
  | 'subscription.system.activate'
  | 'subscription.system.update'
  | 'subscription.system.cancel_scheduled'
  | 'subscription.system.canceled'
  | 'subscription.system.past_due'
  | 'subscription.system.recovered'
  | 'subscription.system.refunded'
  | 'subscription.system.disputed'
  | 'subscription.system.trial_started'
  | 'subscription.system.reconciled'

interface RecordAdminActionInput {
  /** Express request, used to extract the actor id and forensic context. */
  req: Request
  /** What the admin did — must match {@link AdminAuditAction}. */
  action: AdminAuditAction
  /** The user the action targets, when applicable (e.g. persona/bot
   * settings actions don't have a target user). */
  targetUserId?: string | null
  /** Free-form metadata describing the change. Should be small (a few KiB at
   * most) and JSON-serialisable. */
  metadata?: Record<string, unknown>
}

/**
 * Insert a single row into `admin_audit_log`. Never throws.
 */
export async function recordAdminAction(input: RecordAdminActionInput): Promise<void> {
  const { req, action, targetUserId, metadata } = input
  const actorId = req.userId ?? null

  // Express normalises proxy headers when `trust proxy` is set; otherwise
  // `req.ip` is the socket address. Either is acceptable for forensic intent.
  const ip = (req.ip ?? req.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null
  const userAgent = (req.get('user-agent') ?? null)?.slice(0, 512) ?? null

  try {
    await db('admin_audit_log').insert({
      actor_id: actorId,
      target_user_id: targetUserId ?? null,
      action,
      metadata: JSON.stringify(metadata ?? {}),
      ip_address: ip,
      user_agent: userAgent,
    })
  } catch (error) {
    // Audit-log writes must never break the admin action itself. Log loudly
    // so ops notice the failure.
    authLogger.error(
      { error: String(error), actorId, action, targetUserId },
      'failed to write admin audit log entry',
    )
  }
}

/**
 * Record a system-driven audit entry (no human actor) such as a Stripe
 * webhook flipping subscription state. Uses null actor_id and tags
 * metadata.source so it can be distinguished from admin actions when
 * reporting.
 *
 * Optional `executor` lets a webhook handler enroll the audit row in the
 * same transaction as the state change, so a failure rolls both back
 * together. When omitted, falls back to the default pool connection and
 * never throws — so audit-log issues can't break a non-transactional
 * admin action.
 */
export async function recordSystemAction(
  action: AdminAuditAction,
  targetUserId: string | null,
  metadata: Record<string, unknown> = {},
  executor?: Knex | Knex.Transaction,
): Promise<void> {
  const exec = executor ?? db
  try {
    await exec('admin_audit_log').insert({
      actor_id: null,
      target_user_id: targetUserId,
      action,
      metadata: JSON.stringify({ source: 'system', ...metadata }),
      ip_address: null,
      user_agent: null,
    })
  } catch (error) {
    // When the caller supplied a transaction the failure must propagate so
    // the surrounding handler rolls back too — otherwise we'd commit the
    // state change without the matching audit row.
    if (executor) throw error
    authLogger.error(
      { error: String(error), action, targetUserId },
      'failed to write system audit log entry',
    )
  }
}
