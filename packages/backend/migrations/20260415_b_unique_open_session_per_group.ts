import type { Knex } from 'knex'

/**
 * Enforce "at most one open voting session per group" at the database layer.
 *
 * The domain layer (createVotingSession) already does a transactional
 * `SELECT ... FOR UPDATE` + insert, but under READ COMMITTED isolation
 * Postgres does not acquire predicate locks on queries that return zero
 * rows — two concurrent "start vote" requests for the same group can both
 * pass the pre-check and both insert, yielding two `status='open'` rows
 * for the same group.
 *
 * A partial unique index over `(group_id) WHERE status = 'open'` closes
 * that window: the second concurrent INSERT fails with 23505 and the
 * domain layer translates it to the same 409 conflict the early-exit
 * path already returns.
 *
 * The index is created IF NOT EXISTS so the migration is safely
 * idempotent even if a prior rollout ran it manually.
 */
export async function up(knex: Knex): Promise<void> {
  // Before creating the unique index, deduplicate any groups that have
  // more than one open session (legacy data, or rows that slipped
  // through the pre-index race window). Keep the most recent row open
  // and close the rest — we close them rather than delete so any votes
  // already cast stay in the audit history.
  await knex.raw(`
    UPDATE voting_sessions
    SET status = 'closed', closed_at = NOW()
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY group_id
                 ORDER BY created_at DESC, id DESC
               ) AS rn
        FROM voting_sessions
        WHERE status = 'open'
      ) ranked
      WHERE ranked.rn > 1
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_voting_sessions_one_open_per_group
    ON voting_sessions (group_id)
    WHERE status = 'open'
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS uniq_voting_sessions_one_open_per_group')
}
