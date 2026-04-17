import { Router, type Request, type Response } from 'express'
import { createHmac } from 'node:crypto'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

router.get('/identity', (req: Request, res: Response) => {
  if (!env.KOE_IDENTITY_SECRET) {
    res.status(404).json({ error: 'not_found', message: 'Koe widget not configured' })
    return
  }

  const userId = req.userId
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: 'Authentication required' })
    return
  }

  try {
    const userHash = createHmac('sha256', env.KOE_IDENTITY_SECRET).update(userId).digest('hex')
    res.json({ userHash })
  } catch (error) {
    logger.error({ error: String(error) }, 'koe: failed to sign identity')
    res.status(500).json({ error: 'internal', message: 'Failed to sign identity' })
  }
})

export { router as koeRoutes }
