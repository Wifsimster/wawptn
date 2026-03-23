import type { NotificationType } from '@wawptn/types'
import { db } from '../database/connection.js'
import { getIO } from '../socket/socket.js'
import { logger } from '../logger/logger.js'

const notificationLogger = logger.child({ module: 'notifications' })

interface CreateNotificationParams {
  type: NotificationType
  title: string
  body?: string
  groupId?: string
  createdBy?: string
  metadata?: Record<string, unknown>
  recipientUserIds: string[]
  expiresAt?: Date
}

/**
 * Create a notification, persist it, fan-out to recipients, and deliver via Socket.io.
 */
export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const { type, title, body, groupId, createdBy, metadata, recipientUserIds, expiresAt } = params

  if (recipientUserIds.length === 0) return ''

  const [notification] = await db('notifications')
    .insert({
      type,
      title,
      body: body || null,
      group_id: groupId || null,
      created_by: createdBy || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      expires_at: expiresAt || null,
    })
    .returning('*')

  // Fan-out: insert recipient rows
  const recipientRows = recipientUserIds.map((userId) => ({
    notification_id: notification.id,
    user_id: userId,
  }))

  await db.batchInsert('notification_recipients', recipientRows, 500)

  // Deliver via Socket.io to online users
  const io = getIO()
  const payload = {
    id: notification.id,
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    groupId: notification.group_id,
    metadata: notification.metadata ? (typeof notification.metadata === 'string' ? JSON.parse(notification.metadata) : notification.metadata) : null,
    read: false,
    createdAt: notification.created_at,
  }

  for (const userId of recipientUserIds) {
    io.to(`user:${userId}`).emit('notification:new', payload)
  }

  notificationLogger.info(
    { notificationId: notification.id, type, recipientCount: recipientUserIds.length },
    'notification created and delivered'
  )

  return notification.id
}

/**
 * Get unread notifications for a user.
 */
export async function getUnreadNotifications(userId: string, limit = 20) {
  const rows = await db('notification_recipients')
    .join('notifications', 'notification_recipients.notification_id', 'notifications.id')
    .where('notification_recipients.user_id', userId)
    .where('notification_recipients.read_at', null)
    .where(function () {
      this.whereNull('notifications.expires_at').orWhere('notifications.expires_at', '>', new Date())
    })
    .orderBy('notifications.created_at', 'desc')
    .limit(limit)
    .select(
      'notifications.id',
      'notifications.type',
      'notifications.title',
      'notifications.body',
      'notifications.group_id as groupId',
      'notifications.metadata',
      'notifications.created_at as createdAt',
      'notification_recipients.read_at'
    )

  return rows.map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    title: r.title,
    body: r.body,
    groupId: r.groupId,
    metadata: r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
    read: !!r.read_at,
    createdAt: r.createdAt,
  }))
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db('notification_recipients')
    .join('notifications', 'notification_recipients.notification_id', 'notifications.id')
    .where('notification_recipients.user_id', userId)
    .where('notification_recipients.read_at', null)
    .where(function () {
      this.whereNull('notifications.expires_at').orWhere('notifications.expires_at', '>', new Date())
    })
    .count('* as count')
    .first()

  return Number(result?.count || 0)
}

/**
 * Mark a specific notification as read for a user.
 */
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const updated = await db('notification_recipients')
    .where({ notification_id: notificationId, user_id: userId })
    .whereNull('read_at')
    .update({ read_at: db.fn.now() })

  return updated > 0
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  return db('notification_recipients')
    .where({ user_id: userId })
    .whereNull('read_at')
    .update({ read_at: db.fn.now() })
}

/**
 * Cleanup expired notifications. Run periodically via cron.
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  const deleted = await db('notifications')
    .where('expires_at', '<', new Date())
    .del()

  if (deleted > 0) {
    notificationLogger.info({ deletedCount: deleted }, 'expired notifications cleaned up')
  }

  return deleted
}
