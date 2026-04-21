import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { db } from '../../infrastructure/database/connection.js'
import { authLogger } from '../../infrastructure/logger/logger.js'
import { env } from '../../config/env.js'
import { invalidatePremiumCache } from '../../domain/subscription-service.js'
import { recordAdminAction } from '../../domain/admin-audit-log.js'
import { invalidateAllUserSessions } from '../../domain/auth-service.js'
import { notifyPremiumChange } from '../../infrastructure/notifications/premium-notifications.js'
import { sendEmail } from '../../infrastructure/email/email-service.js'
import { getHealth as getSteamHealth } from '../../infrastructure/steam/steam-client.js'
import { getHealth as getEpicHealth } from '../../infrastructure/epic/epic-client.js'
import { getHealth as getGogHealth } from '../../infrastructure/gog/gog-client.js'
import { mergeDuplicateGames } from '../../domain/game-dedupe.js'
import { validateBody } from '../middleware/validate.middleware.js'

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ToggleAdminSchema = z.object({
  isAdmin: z.boolean(),
})

const TogglePremiumSchema = z.object({
  isPremium: z.boolean(),
})

const TestEmailSchema = z.object({
  to: z.string().trim().email("Adresse email invalide").max(254),
  subject: z.string().trim().min(1, 'Sujet requis').max(200).optional(),
  message: z.string().trim().min(1, 'Message requis').max(2000).optional(),
})

const CreatePersonaSchema = z.object({
  // kebab-case identifier, max 50 chars — matches the previous inline regex
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "L'identifiant doit être en kebab-case (ex: mon-persona)"),
  name: z.string().min(1).max(64),
  systemPromptOverlay: z.string().min(1),
  fridayMessages: z.array(z.string().min(1)).min(1),
  weekdayMessages: z.array(z.string().min(1)).min(1),
  backOnlineMessages: z.array(z.string().min(1)).min(1),
  // New pools are optional on create — an admin can leave them empty and
  // the persona will simply skip the off-topic injection / daily pulse.
  idleBanter: z.array(z.string().min(1)).optional(),
  morningGreetings: z.array(z.string().min(1)).optional(),
  weekendVibes: z.array(z.string().min(1)).optional(),
  offTopicInjectionRate: z.number().min(0).max(1).optional(),
  emptyMentionReply: z.string().min(1),
  introMessage: z.string().min(1),
  embedColor: z.number().int().min(0).max(0xffffff),
})

// All fields optional for PATCH; at least one must be provided.
const UpdatePersonaSchema = z
  .object({
    name: z.string().min(1).max(64),
    systemPromptOverlay: z.string().min(1),
    fridayMessages: z.array(z.string().min(1)).min(1),
    weekdayMessages: z.array(z.string().min(1)).min(1),
    backOnlineMessages: z.array(z.string().min(1)).min(1),
    idleBanter: z.array(z.string().min(1)),
    morningGreetings: z.array(z.string().min(1)),
    weekendVibes: z.array(z.string().min(1)),
    offTopicInjectionRate: z.number().min(0).max(1),
    emptyMentionReply: z.string().min(1),
    introMessage: z.string().min(1),
    embedColor: z.number().int().min(0).max(0xffffff),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Aucun champ à mettre à jour',
  })

const router = Router()

// ─── Bot settings ─────────────────────────────────────────────────────────────

router.get('/bot-settings', async (_req: Request, res: Response) => {
  try {
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
  } catch (error) {
    authLogger.error({ error: String(error) }, 'failed to get bot settings')
    res.status(500).json({ error: 'internal', message: 'Failed to get bot settings' })
  }
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
    'daily_pulse_enabled',
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
  await recordAdminAction({
    req,
    action: 'bot_settings.update',
    metadata: { keys: Object.keys(updates) },
  })

  res.json({ ok: true })
})

// ─── Users management ─────────────────────────────────────────────────────────

interface UserRow {
  id: string
  steam_id: string
  display_name: string
  avatar_url: string
  is_admin: boolean
  admin_granted_premium: boolean
  stripe_tier: string | null
  stripe_status: string | null
  stripe_period_end: Date | null
  created_at: Date
}

/** Compute whether a user is currently premium, accounting for both
 * admin-granted access and an active Stripe subscription. */
function computeIsPremium(u: UserRow): boolean {
  if (u.is_admin || u.admin_granted_premium) return true
  if (u.stripe_tier !== 'premium') return false
  if (u.stripe_status !== 'active') return false
  if (u.stripe_period_end && new Date(u.stripe_period_end) < new Date()) return false
  return true
}

router.get('/users', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query['limit']) || 25, 1), 100)
    const offset = Math.max(Number(req.query['offset']) || 0, 0)
    const rawQ = typeof req.query['q'] === 'string' ? req.query['q'].trim() : ''
    const q = rawQ.slice(0, 100)

    const applyFilter = <T extends import('knex').Knex.QueryBuilder>(qb: T): T => {
      if (q) {
        qb.where((w) => {
          w.whereILike('users.display_name', `%${q}%`).orWhereILike('users.steam_id', `%${q}%`)
        })
      }
      return qb
    }

    const totalResult = await applyFilter(db('users')).count('users.id as count').first()
    const total = Number(totalResult?.count ?? 0)

    const users = await applyFilter(db('users'))
      .leftJoin('subscriptions', 'subscriptions.user_id', 'users.id')
      .select(
        'users.id as id',
        'users.steam_id as steam_id',
        'users.display_name as display_name',
        'users.avatar_url as avatar_url',
        'users.is_admin as is_admin',
        'users.admin_granted_premium as admin_granted_premium',
        'users.created_at as created_at',
        'subscriptions.tier as stripe_tier',
        'subscriptions.status as stripe_status',
        'subscriptions.current_period_end as stripe_period_end',
      )
      .orderBy('users.created_at', 'desc')
      .limit(limit)
      .offset(offset) as UserRow[]

    res.json({
      data: users.map((u: UserRow) => ({
        id: u.id,
        steamId: u.steam_id,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        isAdmin: u.is_admin,
        isPremium: computeIsPremium(u),
        adminGrantedPremium: u.admin_granted_premium,
        createdAt: u.created_at,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'failed to list users')
    res.status(500).json({ error: 'internal', message: 'Failed to list users' })
  }
})

// Toggle admin status for a user
router.patch('/users/:id/admin', validateBody(ToggleAdminSchema), async (req: Request, res: Response) => {
  const targetId = String(req.params['id'])
  const { isAdmin } = req.body as z.infer<typeof ToggleAdminSchema>

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

  // Force the target to re-authenticate so any in-flight sessions pick up
  // the new privilege state immediately. Critical when revoking admin: a
  // lingering session would otherwise keep working until natural expiry.
  const invalidatedSessions = await invalidateAllUserSessions(targetId)

  await recordAdminAction({
    req,
    action: isAdmin ? 'user.admin.grant' : 'user.admin.revoke',
    targetUserId: targetId,
    metadata: {
      previousIsAdmin: !!target.is_admin,
      newIsAdmin: isAdmin,
      invalidatedSessions,
    },
  })

  res.json({ ok: true })
})

// Grant or revoke admin-granted premium access for a user
router.patch('/users/:id/premium', validateBody(TogglePremiumSchema), async (req: Request, res: Response) => {
  const targetId = String(req.params['id'])
  const { isPremium } = req.body as z.infer<typeof TogglePremiumSchema>

  const target = await db('users').where({ id: targetId }).first()
  if (!target) {
    res.status(404).json({ error: 'not_found', message: 'Utilisateur introuvable' })
    return
  }

  const wasPremium = !!target.admin_granted_premium
  await db('users').where({ id: targetId }).update({ admin_granted_premium: isPremium })
  invalidatePremiumCache(targetId)

  authLogger.warn(
    { userId: req.userId, targetId, isPremium },
    'admin-granted premium changed',
  )

  // Force re-auth so the next session reflects the new tier without waiting
  // for the in-memory premium cache to expire on every backend instance.
  const invalidatedSessions = await invalidateAllUserSessions(targetId)

  await recordAdminAction({
    req,
    action: isPremium ? 'user.premium.grant' : 'user.premium.revoke',
    targetUserId: targetId,
    metadata: {
      previousAdminGrantedPremium: wasPremium,
      newAdminGrantedPremium: isPremium,
      invalidatedSessions,
    },
  })

  // Notify the target (in-app + email) only when the flag actually flipped,
  // so repeated clicks on the same state don't spam the user.
  if (wasPremium !== isPremium) {
    notifyPremiumChange({
      targetUserId: targetId,
      granted: isPremium,
      actorUserId: req.userId,
    }).catch((error) => {
      authLogger.warn(
        { error: String(error), targetId, isPremium },
        'premium change notification failed',
      )
    })
  }

  res.json({ ok: true })
})

// ─── Personas management ──────────────────────────────────────────────────────

router.get('/personas', async (_req: Request, res: Response) => {
  try {
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
      idleBanter: p.idle_banter ?? [],
      morningGreetings: p.morning_greetings ?? [],
      weekendVibes: p.weekend_vibes ?? [],
      offTopicInjectionRate: Number(p.off_topic_injection_rate ?? 0.3),
      emptyMentionReply: p.empty_mention_reply,
      introMessage: p.intro_message,
      embedColor: p.embed_color,
      isActive: p.is_active,
      isDefault: p.is_default,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })))
  } catch (error) {
    authLogger.error({ error: String(error) }, 'failed to list personas')
    res.status(500).json({ error: 'internal', message: 'Failed to list personas' })
  }
})

router.post('/personas', validateBody(CreatePersonaSchema), async (req: Request, res: Response) => {
  const {
    id,
    name,
    systemPromptOverlay,
    fridayMessages,
    weekdayMessages,
    backOnlineMessages,
    idleBanter,
    morningGreetings,
    weekendVibes,
    offTopicInjectionRate,
    emptyMentionReply,
    introMessage,
    embedColor,
  } = req.body as z.infer<typeof CreatePersonaSchema>

  // Check for duplicate id (uniqueness is a domain concern, not a shape
  // concern, so it stays in the handler instead of moving into the schema)
  const existing = await db('personas').where({ id }).first()
  if (existing) {
    res.status(409).json({ error: 'conflict', message: 'Un persona avec cet identifiant existe déjà' })
    return
  }

  await db('personas').insert({
    id,
    name,
    system_prompt_overlay: systemPromptOverlay,
    friday_messages: JSON.stringify(fridayMessages),
    weekday_messages: JSON.stringify(weekdayMessages),
    back_online_messages: JSON.stringify(backOnlineMessages),
    idle_banter: JSON.stringify(idleBanter ?? []),
    morning_greetings: JSON.stringify(morningGreetings ?? []),
    weekend_vibes: JSON.stringify(weekendVibes ?? []),
    off_topic_injection_rate: offTopicInjectionRate ?? 0.3,
    empty_mention_reply: emptyMentionReply,
    intro_message: introMessage,
    embed_color: embedColor,
    is_active: true,
    is_default: false,
  })

  authLogger.info({ userId: req.userId, personaId: id }, 'admin created persona')
  await recordAdminAction({
    req,
    action: 'persona.create',
    metadata: { personaId: id, name },
  })

  res.status(201).json({ ok: true, id })
})

router.patch('/personas/:id', validateBody(UpdatePersonaSchema), async (req: Request, res: Response) => {
  const personaId = req.params['id']
  const body = req.body as z.infer<typeof UpdatePersonaSchema>

  const persona = await db('personas').where({ id: personaId }).first()
  if (!persona) {
    res.status(404).json({ error: 'not_found', message: 'Persona introuvable' })
    return
  }

  // Build update object from the validated fields. The schema's .refine()
  // already guaranteed at least one field, so we can map straight from
  // body to column names without re-checking emptiness.
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.systemPromptOverlay !== undefined) updates.system_prompt_overlay = body.systemPromptOverlay
  if (body.fridayMessages !== undefined) updates.friday_messages = JSON.stringify(body.fridayMessages)
  if (body.weekdayMessages !== undefined) updates.weekday_messages = JSON.stringify(body.weekdayMessages)
  if (body.backOnlineMessages !== undefined) updates.back_online_messages = JSON.stringify(body.backOnlineMessages)
  if (body.idleBanter !== undefined) updates.idle_banter = JSON.stringify(body.idleBanter)
  if (body.morningGreetings !== undefined) updates.morning_greetings = JSON.stringify(body.morningGreetings)
  if (body.weekendVibes !== undefined) updates.weekend_vibes = JSON.stringify(body.weekendVibes)
  if (body.offTopicInjectionRate !== undefined) updates.off_topic_injection_rate = body.offTopicInjectionRate
  if (body.emptyMentionReply !== undefined) updates.empty_mention_reply = body.emptyMentionReply
  if (body.introMessage !== undefined) updates.intro_message = body.introMessage
  if (body.embedColor !== undefined) updates.embed_color = body.embedColor

  updates.updated_at = db.fn.now()

  await db('personas').where({ id: personaId }).update(updates)

  authLogger.info({ userId: req.userId, personaId }, 'admin updated persona')
  await recordAdminAction({
    req,
    action: 'persona.update',
    metadata: { personaId, fields: Object.keys(updates).filter(k => k !== 'updated_at') },
  })

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
  await recordAdminAction({
    req,
    action: 'persona.delete',
    metadata: { personaId, name: persona.name },
  })

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
  await recordAdminAction({
    req,
    action: 'persona.toggle',
    metadata: { personaId, isActive: newActive },
  })

  res.json({ ok: true, isActive: newActive })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const userCount = await db('users').count('id as count').first()
    const adminCount = await db('users').where({ is_admin: true }).count('id as count').first()
    const groupCount = await db('groups').count('id as count').first()
    const sessionCount = await db('voting_sessions').count('id as count').first()

    res.json({
      users: Number(userCount?.count ?? 0),
      admins: Number(adminCount?.count ?? 0),
      groups: Number(groupCount?.count ?? 0),
      votingSessions: Number(sessionCount?.count ?? 0),
    })
  } catch (error) {
    authLogger.error({ error: String(error) }, 'failed to get admin stats')
    res.status(500).json({ error: 'internal', message: 'Failed to get admin stats' })
  }
})

// ─── Health / observability ──────────────────────────────────────────────────

/**
 * Aggregated health snapshot for ops. Surfaces the state of each external
 * integration's circuit breaker + cache, plus a database ping. Lets admins
 * see when an integration is degraded without tailing the logs.
 *
 * Mounted under /api/admin so it requires the admin middleware (the handler
 * itself never throws — every dependency is wrapped in a try/catch so a
 * single broken integration cannot 500 the whole report).
 */
router.get('/health', async (_req: Request, res: Response) => {
  // Database ping — measures round-trip and reports up/down separately so a
  // DB outage doesn't make the response itself unreadable.
  let dbStatus: 'up' | 'down' = 'down'
  let dbLatencyMs: number | null = null
  try {
    const start = Date.now()
    await db.raw('SELECT 1')
    dbLatencyMs = Date.now() - start
    dbStatus = 'up'
  } catch (error) {
    authLogger.error({ error: String(error) }, 'admin health: database ping failed')
  }

  // Each integration getHealth() is synchronous and reads in-memory state.
  // We still wrap them so a future async refactor (or an unexpected throw)
  // can't take down the rest of the report.
  const safe = <T>(fn: () => T, fallback: T): T => {
    try { return fn() } catch { return fallback }
  }

  res.json({
    timestamp: new Date().toISOString(),
    database: { status: dbStatus, latencyMs: dbLatencyMs },
    integrations: {
      steam: safe(getSteamHealth, { state: 'open', consecutiveFailures: -1, circuitOpenUntil: null, cacheSize: 0 }),
      epic: safe(getEpicHealth, { state: 'open', consecutiveFailures: -1, circuitOpenUntil: null, cacheSize: 0, enabled: false }),
      gog: safe(getGogHealth, { state: 'open', consecutiveFailures: -1, circuitOpenUntil: null, cacheSize: 0, enabled: false }),
    },
  })
})

// ─── Cross-platform game dedupe (Marcus #1) ──────────────────────────────
// One-shot idempotent pass that merges canonical games whose normalised
// names collide. Useful to run after a big normalizer change or when
// cross-platform "not seeing my friend's game" reports come in.
//
// The utility in domain/game-dedupe.ts is safe to re-run; a second call
// after the first merged everything it could will be a no-op. We record
// the invocation in the admin audit log with the summary stats so admins
// can see who triggered the last pass.
router.post('/games/dedupe', async (req: Request, res: Response) => {
  try {
    const result = await mergeDuplicateGames()
    await recordAdminAction({
      req,
      action: 'games.dedupe',
      metadata: { ...result },
    })
    res.json(result)
  } catch (error) {
    authLogger.error({ error: String(error) }, 'admin games dedupe failed')
    res.status(500).json({ error: 'internal', message: 'Failed to run game dedupe pass' })
  }
})

// ─── Email integration test ──────────────────────────────────────────────────
// Lets an admin verify the Resend integration end-to-end (config + delivery)
// without having to trigger a real transactional flow. Useful after rotating
// RESEND_API_KEY or switching EMAIL_FROM domain.

const PLACEHOLDER_EMAIL_SUFFIX = '@steam.wawptn.app'

router.get('/email/status', (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(env.RESEND_API_KEY),
    from: env.EMAIL_FROM,
  })
})

router.post('/email/test', validateBody(TestEmailSchema), async (req: Request, res: Response) => {
  const { to, subject, message } = req.body as z.infer<typeof TestEmailSchema>

  if (!env.RESEND_API_KEY) {
    res.status(503).json({
      error: 'email_not_configured',
      message: "RESEND_API_KEY n'est pas configuré — aucun email ne peut être envoyé",
    })
    return
  }

  if (to.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
    res.status(400).json({
      error: 'placeholder_recipient',
      message: 'Les adresses Steam placeholder ne reçoivent pas d\'email',
    })
    return
  }

  const finalSubject = subject ?? 'WAWPTN — Test d\'intégration email'
  const finalMessage = message ?? 'Ceci est un email de test envoyé depuis le panneau d\'administration WAWPTN.'

  const delivered = await sendEmail({
    to,
    subject: finalSubject,
    text: finalMessage,
    html: `<p>${escapeHtml(finalMessage)}</p><hr /><p style="color:#888;font-size:12px">WAWPTN — email de test administrateur</p>`,
  })

  await recordAdminAction({
    req,
    action: 'email.test',
    metadata: { to, subject: finalSubject, delivered },
  })

  if (!delivered) {
    res.status(502).json({
      error: 'email_delivery_failed',
      message: 'Resend a rejeté l\'email — vérifiez la clé API et le domaine expéditeur',
    })
    return
  }

  authLogger.info({ userId: req.userId, to }, 'admin sent test email')
  res.json({ ok: true, to, subject: finalSubject })
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export { router as adminRoutes }
