import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'

const router = Router()

// ─── Bot settings ─────────────────────────────────────────────────────────────

router.get('/bot-settings', async (_req: Request, res: Response) => {
  const rows = await db('app_settings')
    .where('key', 'like', 'bot.%')
    .select('key', 'value', 'updated_at')

  const settings: Record<string, unknown> = {}
  for (const row of rows) {
    // Strip the 'bot.' prefix for cleaner API response
    const shortKey = row.key.replace(/^bot\./, '')
    settings[shortKey] = row.value
  }

  res.json(settings)
})

router.patch('/bot-settings', async (req: Request, res: Response) => {
  const updates = req.body as Record<string, unknown>

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'validation', message: 'Request body must be a non-empty object' })
    return
  }

  // Allowlist of valid settings keys
  const allowedKeys = new Set([
    'persona_rotation_enabled',
    'friday_schedule',
    'wednesday_schedule',
    'schedule_timezone',
    'disabled_personas',
  ])

  const invalidKeys = Object.keys(updates).filter(k => !allowedKeys.has(k))
  if (invalidKeys.length > 0) {
    res.status(400).json({ error: 'validation', message: `Invalid settings keys: ${invalidKeys.join(', ')}` })
    return
  }

  for (const [key, value] of Object.entries(updates)) {
    await db('app_settings')
      .insert({ key: `bot.${key}`, value: JSON.stringify(value), updated_at: db.fn.now() })
      .onConflict('key')
      .merge({ value: JSON.stringify(value), updated_at: db.fn.now() })
  }

  authLogger.info({ userId: req.userId, keys: Object.keys(updates) }, 'admin updated bot settings')

  res.json({ ok: true })
})

// ─── Users management ─────────────────────────────────────────────────────────

router.get('/users', async (_req: Request, res: Response) => {
  const users = await db('users')
    .select('id', 'steam_id', 'display_name', 'avatar_url', 'is_admin', 'created_at')
    .orderBy('created_at', 'asc')

  res.json(users.map(u => ({
    id: u.id,
    steamId: u.steam_id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    isAdmin: u.is_admin,
    createdAt: u.created_at,
  })))
})

// Toggle admin status for a user
router.patch('/users/:id/admin', async (req: Request, res: Response) => {
  const targetId = req.params['id']
  const { isAdmin } = req.body as { isAdmin?: boolean }

  if (typeof isAdmin !== 'boolean') {
    res.status(400).json({ error: 'validation', message: 'isAdmin (boolean) is required' })
    return
  }

  // Prevent self-demotion
  if (targetId === req.userId && !isAdmin) {
    res.status(400).json({ error: 'validation', message: 'Vous ne pouvez pas révoquer votre propre accès admin' })
    return
  }

  const target = await db('users').where({ id: targetId }).first()
  if (!target) {
    res.status(404).json({ error: 'not_found', message: 'Utilisateur introuvable' })
    return
  }

  await db('users').where({ id: targetId }).update({ is_admin: isAdmin })
  authLogger.warn({ userId: req.userId, targetId, isAdmin }, 'admin role changed')

  res.json({ ok: true })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  const userCount = await db('users').count('id as count').first()
  const groupCount = await db('groups').count('id as count').first()
  const sessionCount = await db('voting_sessions').count('id as count').first()

  res.json({
    users: Number(userCount?.count ?? 0),
    groups: Number(groupCount?.count ?? 0),
    votingSessions: Number(sessionCount?.count ?? 0),
  })
})

export { router as adminRoutes }
