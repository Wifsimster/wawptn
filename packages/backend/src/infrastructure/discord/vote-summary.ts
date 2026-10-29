import type { DiscordVoteSummary, DiscordVoteTally } from '@wawptn/types'
import { db } from '../database/connection.js'

export async function buildVoteSummary(sessionId: string): Promise<DiscordVoteSummary> {
  const games = await db('voting_session_games')
    .where({ session_id: sessionId })
    .orderBy('steam_app_id', 'asc')
    .select(
      'steam_app_id as steamAppId',
      'game_name as gameName',
      'header_image_url as headerImageUrl',
    )

  const tallyRows: Array<{ steam_app_id: number; vote: boolean; count: string }> = await db('votes')
    .where({ session_id: sessionId })
    .groupBy('steam_app_id', 'vote')
    .select('steam_app_id', 'vote', db.raw('COUNT(*) as count'))

  const tallyMap = new Map<number, { yes: number; no: number }>()
  for (const row of tallyRows) {
    const entry = tallyMap.get(row.steam_app_id) ?? { yes: 0, no: 0 }
    if (row.vote) entry.yes = Number(row.count)
    else entry.no = Number(row.count)
    tallyMap.set(row.steam_app_id, entry)
  }

  const tallies: DiscordVoteTally[] = games.map((g) => ({
    steamAppId: g.steamAppId,
    gameName: g.gameName,
    headerImageUrl: g.headerImageUrl,
    yesCount: tallyMap.get(g.steamAppId)?.yes ?? 0,
    noCount: tallyMap.get(g.steamAppId)?.no ?? 0,
  }))

  const voterCountRow = await db('votes')
    .where({ session_id: sessionId })
    .countDistinct('user_id as count')
    .first()

  const participantCountRow = await db('voting_session_participants')
    .where({ session_id: sessionId })
    .count('* as count')
    .first()

  const voterCount = Number(voterCountRow?.count ?? 0)
  let totalParticipants = Number(participantCountRow?.count ?? 0)

  if (totalParticipants === 0) {
    const session = await db('voting_sessions').where({ id: sessionId }).first()
    if (session) {
      const mCount = await db('group_members')
        .where({ group_id: session.group_id })
        .count('* as count')
        .first()
      totalParticipants = Number(mCount?.count ?? 0)
    }
  }

  return { voterCount, totalParticipants, tallies }
}
