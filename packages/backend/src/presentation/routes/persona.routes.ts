import { Router, type Request, type Response } from 'express'
import { logger } from '../../infrastructure/logger/logger.js'
import { selectPersonaForGroup } from '../../domain/persona-selection.js'

const router = Router()

/**
 * GET /api/persona/current — public, returns the global fallback persona
 * for the app (used on the login/landing page and anywhere no group
 * context exists).
 *
 * **Deprecated.** Per-group personas are the new canonical source — each
 * group now has its own daily persona reachable at
 * `GET /api/groups/:groupId/persona/current`. This endpoint is kept for
 * backward compatibility with the landing page and signals its status via
 * a `Deprecation` + `Sunset` header (RFC 8594).
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    const persona = await selectPersonaForGroup(null)

    if (!persona) {
      res.status(404).json({ error: 'not_found', message: 'No active personas' })
      return
    }

    res.setHeader('Deprecation', 'true')
    res.setHeader('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT')
    res.setHeader(
      'Link',
      '</api/groups/{groupId}/persona/current>; rel="successor-version"',
    )
    res.json(persona)
  } catch (error) {
    logger.error({ error: String(error) }, 'persona: failed to get current')
    res.status(500).json({ error: 'internal', message: 'Failed to get current persona' })
  }
})

export { router as personaRoutes }
