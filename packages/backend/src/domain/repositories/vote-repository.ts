export interface VotingSessionRow {
  id: string
  group_id: string
  status: 'open' | 'closed'
  created_by: string
  winning_game_app_id: number | null
  winning_game_id: string | null
  winning_game_name: string | null
  scheduled_at: Date | null
  closed_at: Date | null
  created_at: Date
}

export interface VoteRow {
  session_id: string
  user_id: string
  steam_app_id: number
  game_id: string | null
  vote: boolean
  created_at: Date
}

export interface IVoteRepository {
  findOpenSession(groupId: string): Promise<VotingSessionRow | null>

  findSessionById(id: string): Promise<VotingSessionRow | null>

  listClosedSessions(
    groupId: string,
    limit: number,
    offset: number,
  ): Promise<VotingSessionRow[]>

  countClosedSessions(groupId: string): Promise<number>

  findVotesBySession(sessionId: string): Promise<VoteRow[]>

  countVotersBySession(sessionId: string): Promise<number>
}
