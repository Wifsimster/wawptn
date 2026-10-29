import { Router, type Request, type Response } from 'express'
import { logger } from '../../infrastructure/logger/logger.js'
import { selectPersonaForGroup } from '../../domain/persona-selection.js'

const router = Router()

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
