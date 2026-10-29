import type { Request } from 'express'
import type { Knex } from 'knex'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'

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
  req: Request
  action: AdminAuditAction
  targetUserId?: string | null
  metadata?: Record<string, unknown>
}

export async function recordAdminAction(input: RecordAdminActionInput): Promise<void> {
  const { req, action, targetUserId, metadata } = input
  const actorId = req.userId ?? null

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
    authLogger.error(
      { error: String(error), actorId, action, targetUserId },
      'failed to write admin audit log entry',
    )
  }
}

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
    if (executor) throw error
    authLogger.error(
      { error: String(error), action, targetUserId },
      'failed to write system audit log entry',
    )
  }
}
