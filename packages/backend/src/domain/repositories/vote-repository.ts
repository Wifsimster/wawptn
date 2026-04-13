/**
 * Vote repository interface — abstracts voting session and vote persistence
 * so domain/application code does not depend directly on Knex/Postgres.
 *
 * Concrete implementations live under `src/infrastructure/repositories/`.
 */

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
  /** Return the currently open voting session for a group, or `null`. */
  findOpenSession(groupId: string): Promise<VotingSessionRow | null>

  /** Look up a voting session by id. Returns `null` when not found. */
  findSessionById(id: string): Promise<VotingSessionRow | null>

  /**
   * List closed voting sessions for a group in reverse-chronological order,
   * with pagination.
   */
  listClosedSessions(
    groupId: string,
    limit: number,
    offset: number,
  ): Promise<VotingSessionRow[]>

  /** Count closed voting sessions for a group (useful for pagination). */
  countClosedSessions(groupId: string): Promise<number>

  /** Return every vote row belonging to a session. */
  findVotesBySession(sessionId: string): Promise<VoteRow[]>

  /** Count distinct users that have voted in a session. */
  countVotersBySession(sessionId: string): Promise<number>
}
