import { Router, type Request, type Response } from 'express'
import {
  getUnreadNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
} from '../../infrastructure/notifications/notification-service.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// Get unread notifications for current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const notifications = await getUnreadNotifications(userId)
    res.json(notifications)
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to fetch notifications')
    res.status(500).json({ error: 'internal', message: 'Failed to fetch notifications' })
  }
})

// Get unread count
router.get('/count', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const count = await getUnreadCount(userId)
    res.json({ count })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to fetch notification count')
    res.status(500).json({ error: 'internal', message: 'Failed to fetch notification count' })
  }
})

// Mark a single notification as read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const notificationId = String(req.params['id'])
    const updated = await markAsRead(notificationId, userId)

    if (!updated) {
      res.status(404).json({ error: 'not_found', message: 'Notification introuvable ou déjà lue' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId, notificationId: req.params['id'] }, 'failed to mark notification as read')
    res.status(500).json({ error: 'internal', message: 'Failed to mark notification as read' })
  }
})

// Mark all notifications as read
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!
    const count = await markAllAsRead(userId)
    res.json({ ok: true, count })
  } catch (error) {
    logger.error({ error: String(error), userId: req.userId }, 'failed to mark all notifications as read')
    res.status(500).json({ error: 'internal', message: 'Failed to mark all notifications as read' })
  }
})

export { router as notificationRoutes }

// ─── Admin notification routes ───────────────────────────────────────────────

const adminRouter = Router()

// Broadcast a notification to all users or a specific group
adminRouter.post('/', async (req: Request, res: Response) => {
  const adminUserId = req.userId!
  const { title, body, groupId } = req.body as { title?: string; body?: string; groupId?: string }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'validation', message: 'Le titre est requis' })
    return
  }

  if (title.length > 255) {
    res.status(400).json({ error: 'validation', message: 'Le titre ne doit pas dépasser 255 caractères' })
    return
  }

  if (body && typeof body === 'string' && body.length > 2000) {
    res.status(400).json({ error: 'validation', message: 'Le corps ne doit pas dépasser 2000 caractères' })
    return
  }

  // Determine recipients
  let recipientUserIds: string[]
  if (groupId) {
    recipientUserIds = await db('group_members')
      .where({ group_id: groupId })
      .pluck('user_id')

    if (recipientUserIds.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Groupe introuvable ou vide' })
      return
    }
  } else {
    recipientUserIds = await db('users').pluck('id')
  }

  const notificationId = await createNotification({
    type: 'admin_broadcast',
    title: title.trim(),
    body: body?.trim() || undefined,
    groupId,
    createdBy: adminUserId,
    recipientUserIds,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  })

  logger.info(
    { adminUserId, notificationId, recipientCount: recipientUserIds.length, groupId },
    'admin broadcast notification sent'
  )

  res.status(201).json({ ok: true, notificationId, recipientCount: recipientUserIds.length })
})

export { adminRouter as adminNotificationRoutes }
