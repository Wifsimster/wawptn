import { Router, type Request, type Response } from 'express'
import { db } from '../../infrastructure/database/connection.js'
import { generateVoteResultImage } from '../../infrastructure/og/og-image-generator.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

/**
 * Public OG image endpoint for closed voting sessions.
 * Returns a 1200x630 PNG with the winning game rendered on a branded card.
 * Cached aggressively since the content is immutable (closed session).
 */
router.get('/og/vote/:sessionId.png', async (req: Request, res: Response) => {
  const sessionId = String(req.params['sessionId'])

  try {
    const session = await db('voting_sessions')
      .where({ id: sessionId, status: 'closed' })
      .whereNotNull('winning_game_name')
      .first()

    if (!session) {
      res.status(404).json({ error: 'not_found', message: 'Closed session not found' })
      return
    }

    const group = await db('groups')
      .where({ id: session.group_id })
      .first()

    if (!group) {
      res.status(404).json({ error: 'not_found', message: 'Group not found' })
      return
    }

    // Get header image from the voting_session_games row matching the winning game
    let headerImageUrl: string | null = null
    if (session.winning_game_app_id) {
      const gameRow = await db('voting_session_games')
        .where({ session_id: sessionId, steam_app_id: session.winning_game_app_id })
        .select('header_image_url')
        .first() as { header_image_url: string | null } | undefined
      headerImageUrl = gameRow?.header_image_url ?? null
    }

    // Get yes-vote count for the winning game
    const yesCountRow = await db('votes')
      .where({ session_id: sessionId, steam_app_id: session.winning_game_app_id, vote: true })
      .count('* as count')
      .first()
    const yesCount = Number(yesCountRow?.count || 0)

    // Distinct voter count across all games in this session
    const voterCountRow = await db('votes')
      .where({ session_id: sessionId })
      .countDistinct('user_id as count')
      .first()
    const voterCount = Number(voterCountRow?.count || 0)

    // Total voters: prefer participants count, fallback to current group members
    const participantCountRow = await db('voting_session_participants')
      .where({ session_id: sessionId })
      .count('* as count')
      .first()
    let totalVoters = Number(participantCountRow?.count || 0)
    if (totalVoters === 0) {
      const memberCountRow = await db('group_members')
        .where({ group_id: session.group_id })
        .count('* as count')
        .first()
      totalVoters = Number(memberCountRow?.count || 0)
    }

    const png = await generateVoteResultImage({
      groupName: group.name,
      gameName: session.winning_game_name,
      headerImageUrl,
      voterCount,
      yesCount,
      totalVoters,
    })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.send(png)
  } catch (error) {
    logger.error({ error: String(error), sessionId }, 'og vote image generation failed')
    res.status(500).json({ error: 'internal', message: 'Failed to generate image' })
  }
})

export { router as ogRoutes }
