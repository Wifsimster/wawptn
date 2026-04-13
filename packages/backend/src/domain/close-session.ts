import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import { evaluateChallenges } from './challenges/challenge-service.js'
import { updateStreak } from './streaks.js'
import { domainEvents } from './events/event-bus.js'
import { recordSessionEvent } from './session-audit-trail.js'
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

  // Load participants for event payload + downstream domain logic (challenges, streaks)
  const participantIds: string[] = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .pluck('user_id')

  // Pin a snapshot of who was eligible to vote at close time + the final
  // tally to the session_audit_trail. This is the canonical record for
  // dispute resolution: even if a member is later removed from the group
  // or the session is purged, the closed-state evidence stays intact (the
  // row CASCADEs on session delete by design — that's a deliberate scope
  // choice; system-wide retention belongs in a separate ETL).
  await recordSessionEvent({
    sessionId,
    event: 'session_closed',
    metadata: {
      groupId,
      participantIds,
      winnerAppId,
      winnerName,
      yesCount: result.yesCount,
      totalVoters: result.totalVoters,
    },
  })

  // Emit domain event — side effects (Socket.io, Discord, in-app notifs) are
  // handled by subscribers registered in infrastructure/effects/session-effects.ts
  domainEvents.emit('session:closed', {
    sessionId,
    groupId,
    result,
    participantIds,
  })

  // Evaluate participation challenges for all participants (non-blocking)
  for (const pid of participantIds) {
    evaluateChallenges(pid, ['participation']).catch(err =>
      logger.warn({ error: String(err), userId: pid }, 'challenge evaluation after session close failed')
    )
  }

  // Update voting streaks for all participants (non-blocking)
  for (const pid of participantIds) {
    updateStreak(pid, groupId, sessionId).catch(err =>
      logger.warn({ error: String(err), userId: pid, groupId }, 'streak update after session close failed')
    )
  }

  logger.info({ sessionId, groupId, winner: winnerName, winnerAppId }, 'voting session closed')

  return result
}
