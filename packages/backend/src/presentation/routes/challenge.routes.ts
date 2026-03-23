import { Router, type Request, type Response } from 'express'
import { getChallengesForUser } from '../../domain/challenges/challenge-service.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// Get current user's challenge progress
router.get('/me', async (req: Request, res: Response) => {
  const userId = req.userId!
  try {
    const challenges = await getChallengesForUser(userId)
    const totalUnlocked = challenges.filter(c => c.unlockedAt !== null).length
    res.json({
      challenges,
      stats: {
        totalUnlocked,
        totalChallenges: challenges.length,
      },
    })
  } catch (error) {
    logger.error({ error: String(error), userId }, 'failed to get challenges')
    res.status(500).json({ error: 'internal', message: 'Failed to get challenges' })
  }
})

export { router as challengeRoutes }
