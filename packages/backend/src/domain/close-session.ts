import { db } from '../infrastructure/database/connection.js'
import { getIO } from '../infrastructure/socket/socket.js'
import { logger } from '../infrastructure/logger/logger.js'
import { notifyVoteClosed } from '../infrastructure/discord/notifier.js'
import { createNotification } from '../infrastructure/notifications/notification-service.js'
import { evaluateChallenges } from './challenges/challenge-service.js'
import type { VoteResult } from '@wawptn/types'

/**
 * Atomically close a voting session and tally votes.
 * Returns the VoteResult if the session was closed, or null if it was already closed.
 */
export async function closeSession(sessionId: string, groupId: string): Promise<VoteResult | null> {
  // Wrap the entire close + tally + winner update in a single transaction
  // to prevent races between concurrent close requests
  const txResult = await db.transaction(async (trx) => {
    // Atomically claim the right to close (optimistic locking)
    const updated = await trx('voting_sessions')
      .where({ id: sessionId, status: 'open' })
      .update({
        status: 'closed',
        closed_at: trx.fn.now(),
      })

    if (updated === 0) {
      // Already closed by another process/request
      return null
    }

    // Tally votes: count yes-votes per game
    const results = await trx('votes')
      .where({ session_id: sessionId, vote: true })
      .groupBy('steam_app_id')
      .select('steam_app_id', trx.raw('COUNT(*) as yes_count'))
      .orderBy('yes_count', 'desc')

    let winnerAppId: number | null = null
    let winnerGameId: string | null = null
    let winnerName: string | null = null

    if (results.length > 0) {
      const maxVotes = Number(results[0]!.yes_count)
      const tied = results.filter(r => Number(r.yes_count) === maxVotes)
      const winner = tied[Math.floor(Math.random() * tied.length)]!
      winnerAppId = winner.steam_app_id

      const gameInfo = await trx('voting_session_games')
        .where({ session_id: sessionId, steam_app_id: winnerAppId })
        .first()
      winnerName = gameInfo?.game_name || null
      winnerGameId = gameInfo?.game_id || null
    }

    await trx('voting_sessions').where({ id: sessionId }).update({
      winning_game_app_id: winnerAppId,
      winning_game_name: winnerName,
      winning_game_id: winnerGameId,
    })

    const voterCount = await trx('votes')
      .where({ session_id: sessionId })
      .countDistinct('user_id as count')
      .first()

    return { winnerAppId, winnerGameId, winnerName, results, voterCount }
  })

  if (!txResult) return null

  const { winnerAppId, winnerGameId, winnerName, results, voterCount } = txResult

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

  // In-app notification for group participants (non-blocking)
  const group = await db('groups').where({ id: groupId }).first()
  const groupName = group?.name || 'Groupe'
  const participantIds: string[] = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .pluck('user_id')

  if (participantIds.length > 0 && winnerName) {
    createNotification({
      type: 'vote_closed',
      title: `${winnerName} a gagné dans ${groupName} !`,
      body: `${result.yesCount} sur ${result.totalVoters} ont voté pour.`,
      groupId,
      metadata: {
        sessionId,
        winnerAppId,
        winnerName,
        actionUrl: `/groups/${groupId}/vote`,
      },
      recipientUserIds: participantIds,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }).catch(err =>
      logger.warn({ error: String(err), groupId }, 'in-app vote closed notification failed')
    )
  }

  // Evaluate participation challenges for all participants (non-blocking)
  for (const pid of participantIds) {
    evaluateChallenges(pid, ['participation']).catch(err =>
      logger.warn({ error: String(err), userId: pid }, 'challenge evaluation after session close failed')
    )
  }

  logger.info({ sessionId, groupId, winner: winnerName, winnerAppId }, 'voting session closed')

  return result
}
