import { db } from '../infrastructure/database/connection.js'
import { getIO } from '../infrastructure/socket/socket.js'
import { logger } from '../infrastructure/logger/logger.js'
import { notifyVoteClosed } from '../infrastructure/discord/notifier.js'
import type { VoteResult } from '@wawptn/types'

/**
 * Atomically close a voting session and tally votes.
 * Returns the VoteResult if the session was closed, or null if it was already closed.
 */
export async function closeSession(sessionId: string, groupId: string): Promise<VoteResult | null> {
  // Atomically claim the right to close (optimistic locking)
  const updated = await db('voting_sessions')
    .where({ id: sessionId, status: 'open' })
    .update({
      status: 'closed',
      closed_at: db.fn.now(),
    })

  if (updated === 0) {
    // Already closed by another process/request
    return null
  }

  // Tally votes: count yes-votes per game
  const results = await db('votes')
    .where({ session_id: sessionId, vote: true })
    .groupBy('steam_app_id')
    .select('steam_app_id', db.raw('COUNT(*) as yes_count'))
    .orderBy('yes_count', 'desc')

  let winnerAppId: number | null = null
  let winnerGameId: string | null = null
  let winnerName: string | null = null

  if (results.length > 0) {
    const maxVotes = Number(results[0]!.yes_count)
    const tied = results.filter(r => Number(r.yes_count) === maxVotes)
    const winner = tied[Math.floor(Math.random() * tied.length)]!
    winnerAppId = winner.steam_app_id

    const gameInfo = await db('voting_session_games')
      .where({ session_id: sessionId, steam_app_id: winnerAppId })
      .first()
    winnerName = gameInfo?.game_name || null
    winnerGameId = gameInfo?.game_id || null
  }

  await db('voting_sessions').where({ id: sessionId }).update({
    winning_game_app_id: winnerAppId,
    winning_game_name: winnerName,
    winning_game_id: winnerGameId,
  })

  const voterCount = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  const result: VoteResult = {
    steamAppId: winnerAppId ?? 0,
    gameId: winnerGameId ?? undefined,
    gameName: winnerName ?? 'Unknown',
    headerImageUrl: winnerAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${winnerAppId}/header.jpg` : null,
    yesCount: results.length > 0 ? Number(results[0]!.yes_count) : 0,
    totalVoters: Number(voterCount?.count || 0),
  }

  // Broadcast result
  getIO().to(`group:${groupId}`).emit('vote:closed', { sessionId, result })

  // Notify Discord channel (non-blocking)
  notifyVoteClosed(groupId, result).catch(err =>
    logger.warn({ error: String(err), groupId }, 'Discord notification failed')
  )

  logger.info({ sessionId, groupId, winner: winnerName, winnerAppId }, 'voting session closed')

  return result
}
