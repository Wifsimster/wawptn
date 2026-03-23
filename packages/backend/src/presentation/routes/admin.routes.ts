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
    'announce_persona_change',
    'persona_override',
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

// ─── Personas management ──────────────────────────────────────────────────────

router.get('/personas', async (_req: Request, res: Response) => {
  const personas = await db('personas')
    .select('*')
    .orderBy('is_default', 'desc')
    .orderBy('created_at', 'asc')

  res.json(personas.map(p => ({
    id: p.id,
    name: p.name,
    systemPromptOverlay: p.system_prompt_overlay,
    fridayMessages: p.friday_messages,
    weekdayMessages: p.weekday_messages,
    backOnlineMessages: p.back_online_messages,
    emptyMentionReply: p.empty_mention_reply,
    introMessage: p.intro_message,
    embedColor: p.embed_color,
    isActive: p.is_active,
    isDefault: p.is_default,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  })))
})

router.post('/personas', async (req: Request, res: Response) => {
  const body = req.body as {
    id?: string
    name?: string
    systemPromptOverlay?: string
    fridayMessages?: string[]
    weekdayMessages?: string[]
    backOnlineMessages?: string[]
    emptyMentionReply?: string
    introMessage?: string
    embedColor?: number
  }

  // Validate required fields
  const { id, name, systemPromptOverlay, fridayMessages, weekdayMessages, backOnlineMessages, emptyMentionReply, introMessage, embedColor } = body

  if (!id || !name || !systemPromptOverlay || !fridayMessages || !weekdayMessages || !backOnlineMessages || !emptyMentionReply || !introMessage || embedColor === undefined) {
    res.status(400).json({ error: 'validation', message: 'Tous les champs sont requis : id, name, systemPromptOverlay, fridayMessages, weekdayMessages, backOnlineMessages, emptyMentionReply, introMessage, embedColor' })
    return
  }

  // Validate id format (kebab-case)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    res.status(400).json({ error: 'validation', message: "L'identifiant doit être en kebab-case (ex: mon-persona)" })
    return
  }

  if (id.length > 50) {
    res.status(400).json({ error: 'validation', message: "L'identifiant ne doit pas dépasser 50 caractères" })
    return
  }

  // Check for duplicate id
  const existing = await db('personas').where({ id }).first()
  if (existing) {
    res.status(409).json({ error: 'conflict', message: 'Un persona avec cet identifiant existe déjà' })
    return
  }

  // Validate arrays
  if (!Array.isArray(fridayMessages) || !Array.isArray(weekdayMessages) || !Array.isArray(backOnlineMessages)) {
    res.status(400).json({ error: 'validation', message: 'fridayMessages, weekdayMessages et backOnlineMessages doivent être des tableaux' })
    return
  }

  await db('personas').insert({
    id,
    name,
    system_prompt_overlay: systemPromptOverlay,
    friday_messages: JSON.stringify(fridayMessages),
    weekday_messages: JSON.stringify(weekdayMessages),
    back_online_messages: JSON.stringify(backOnlineMessages),
    empty_mention_reply: emptyMentionReply,
    intro_message: introMessage,
    embed_color: embedColor,
    is_active: true,
    is_default: false,
  })

  authLogger.info({ userId: req.userId, personaId: id }, 'admin created persona')

  res.status(201).json({ ok: true, id })
})

router.patch('/personas/:id', async (req: Request, res: Response) => {
  const personaId = req.params['id']
  const body = req.body as Record<string, unknown>

  const persona = await db('personas').where({ id: personaId }).first()
  if (!persona) {
    res.status(404).json({ error: 'not_found', message: 'Persona introuvable' })
    return
  }

  // Build update object from allowed fields
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.systemPromptOverlay !== undefined) updates.system_prompt_overlay = body.systemPromptOverlay
  if (body.fridayMessages !== undefined) updates.friday_messages = JSON.stringify(body.fridayMessages)
  if (body.weekdayMessages !== undefined) updates.weekday_messages = JSON.stringify(body.weekdayMessages)
  if (body.backOnlineMessages !== undefined) updates.back_online_messages = JSON.stringify(body.backOnlineMessages)
  if (body.emptyMentionReply !== undefined) updates.empty_mention_reply = body.emptyMentionReply
  if (body.introMessage !== undefined) updates.intro_message = body.introMessage
  if (body.embedColor !== undefined) updates.embed_color = body.embedColor

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'validation', message: 'Aucun champ à mettre à jour' })
    return
  }

  updates.updated_at = db.fn.now()

  await db('personas').where({ id: personaId }).update(updates)

  authLogger.info({ userId: req.userId, personaId }, 'admin updated persona')

  res.json({ ok: true })
})

router.delete('/personas/:id', async (req: Request, res: Response) => {
  const personaId = req.params['id']

  const persona = await db('personas').where({ id: personaId }).first()
  if (!persona) {
    res.status(404).json({ error: 'not_found', message: 'Persona introuvable' })
    return
  }

  if (persona.is_default) {
    res.status(400).json({ error: 'validation', message: 'Les personas par défaut ne peuvent pas être supprimés' })
    return
  }

  await db('personas').where({ id: personaId }).del()

  authLogger.info({ userId: req.userId, personaId }, 'admin deleted persona')

  res.json({ ok: true })
})

router.patch('/personas/:id/toggle', async (req: Request, res: Response) => {
  const personaId = req.params['id']

  const persona = await db('personas').where({ id: personaId }).first()
  if (!persona) {
    res.status(404).json({ error: 'not_found', message: 'Persona introuvable' })
    return
  }

  const newActive = !persona.is_active
  await db('personas').where({ id: personaId }).update({
    is_active: newActive,
    updated_at: db.fn.now(),
  })

  authLogger.info({ userId: req.userId, personaId, isActive: newActive }, 'admin toggled persona')

  res.json({ ok: true, isActive: newActive })
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
