import type { Request } from 'express'
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
