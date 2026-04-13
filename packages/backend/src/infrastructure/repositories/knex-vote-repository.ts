import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import type {
  IVoteRepository,
  VotingSessionRow,
  VoteRow,
} from '../../domain/repositories/vote-repository.js'

/**
 * Knex-backed implementation of `IVoteRepository`.
 *
 * The `knex` instance is injected (defaulting to the shared `db` singleton),
 * which lets callers pass a transaction (`trx`) or a test double.
 */
export class KnexVoteRepository implements IVoteRepository {
  constructor(private readonly knex: Knex = db) {}

  async findOpenSession(groupId: string): Promise<VotingSessionRow | null> {
    const row = await this.knex<VotingSessionRow>('voting_sessions')
      .where({ group_id: groupId, status: 'open' })
      .first()
    return row ?? null
  }

  async findSessionById(id: string): Promise<VotingSessionRow | null> {
    const row = await this.knex<VotingSessionRow>('voting_sessions')
      .where({ id })
      .first()
    return row ?? null
  }

  async listClosedSessions(
    groupId: string,
    limit: number,
    offset: number,
  ): Promise<VotingSessionRow[]> {
    return this.knex<VotingSessionRow>('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .orderBy('closed_at', 'desc')
      .limit(limit)
      .offset(offset)
  }

  async countClosedSessions(groupId: string): Promise<number> {
    const row = await this.knex('voting_sessions')
      .where({ group_id: groupId, status: 'closed' })
      .count<{ count: string | number }>('* as count')
      .first()
    return Number(row?.count ?? 0)
  }

  async findVotesBySession(sessionId: string): Promise<VoteRow[]> {
    return this.knex<VoteRow>('votes').where({ session_id: sessionId })
  }

  async countVotersBySession(sessionId: string): Promise<number> {
    const row = await this.knex('votes')
      .where({ session_id: sessionId })
      .countDistinct<{ count: string | number }>('user_id as count')
      .first()
    return Number(row?.count ?? 0)
  }
}

/** Default singleton bound to the shared `db` connection. */
export const voteRepository: IVoteRepository = new KnexVoteRepository()
