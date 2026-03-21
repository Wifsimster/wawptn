import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// In-memory cache (persona changes at most once per day)
let cachedPersona: { id: string; name: string; embedColor: number; introMessage: string } | null = null
let cacheExpiry = 0

/**
 * djb2 string hash — deterministic, same as packages/discord/src/personas.ts.
 * Keep in sync with the Discord bot's hashCode function.
 */
function hashCode(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// GET /api/persona/current — public, returns today's active persona
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const now = Date.now()
    if (cachedPersona && now < cacheExpiry) {
      res.json(cachedPersona)
      return
    }

    // Check if rotation is enabled
    const rotationSetting = await db('app_settings')
      .where({ key: 'bot.persona_rotation_enabled' })
      .select('value')
      .first()
    const rotationEnabled = rotationSetting?.value === true

    // Get disabled personas list
    const disabledSetting = await db('app_settings')
      .where({ key: 'bot.disabled_personas' })
      .select('value')
      .first()
    const disabledIds: string[] = Array.isArray(disabledSetting?.value) ? disabledSetting.value : []

    // Fetch active personas
    const personas = await db('personas')
      .where({ is_active: true })
      .orderBy('created_at', 'asc')
      .select('id', 'name', 'embed_color', 'intro_message')

    if (personas.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'No active personas' })
      return
    }

    let selected

    if (!rotationEnabled) {
      // No rotation: use first active persona (default)
      selected = personas[0]
    } else {
      // Filter out disabled personas
      const available = disabledIds.length > 0
        ? personas.filter((p: { id: string }) => !disabledIds.includes(p.id))
        : personas
      const pool = available.length > 0 ? available : personas

      // Deterministic selection based on date (Europe/Paris timezone)
      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
      const index = hashCode(dateStr) % pool.length
      selected = pool[index]
    }

    cachedPersona = {
      id: selected.id,
      name: selected.name,
      embedColor: selected.embed_color,
      introMessage: selected.intro_message,
    }
    cacheExpiry = now + 5 * 60 * 1000 // 5 minutes

    res.json(cachedPersona)
  } catch (error) {
    logger.error({ error: String(error) }, 'persona: failed to get current')
    res.status(500).json({ error: 'internal', message: 'Failed to get current persona' })
  }
})

export { router as personaRoutes }
