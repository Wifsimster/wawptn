import type { Knex } from 'knex'

/**
 * Add missing indexes on columns frequently used in WHERE clauses, JOINs
 * and GROUP BY operations. Each index is created with IF NOT EXISTS to
 * keep the migration idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  // votes.user_id — challenge evaluation queries GROUP BY user_id
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_votes_user_id
    ON votes (user_id)
  `)

  // votes.session_id already has an index from the initial migration,
  // but we ensure it exists for vote-counting (countDistinct) queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_votes_session_id
    ON votes (session_id)
  `)

  // group_members.user_id — membership checks on every authenticated route
  // (composite PK is (group_id, user_id) so lookups by user_id alone need this)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id
    ON group_members (user_id)
  `)

  // user_challenges.user_id — challenge progress lookups
  // (composite PK is (user_id, challenge_id) which covers this,
  //  but an explicit single-column index avoids relying on PK ordering)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id
    ON user_challenges (user_id)
  `)

  // notification_recipients.user_id — unread notification queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id
    ON notification_recipients (user_id)
  `)

  // notification_recipients.read_at — WHERE read_at IS NULL filters
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notification_recipients_read_at
    ON notification_recipients (read_at)
  `)

  // voting_sessions(group_id, status) — already created in initial migration,
  // this is a no-op safety net
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_voting_sessions_group_id_status
    ON voting_sessions (group_id, status)
  `)

  // voting_session_participants.session_id — participant lookups
  // (composite PK is (session_id, user_id) which covers session_id-leading queries,
  //  but an explicit index makes the intent clear and survives PK changes)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_voting_session_participants_session_id
    ON voting_session_participants (session_id)
  `)

  // voting_session_participants.user_id — participation checks
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_voting_session_participants_user_id
    ON voting_session_participants (user_id)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_voting_session_participants_user_id')
  await knex.raw('DROP INDEX IF EXISTS idx_voting_session_participants_session_id')
  await knex.raw('DROP INDEX IF EXISTS idx_voting_sessions_group_id_status')
  await knex.raw('DROP INDEX IF EXISTS idx_notification_recipients_read_at')
  await knex.raw('DROP INDEX IF EXISTS idx_notification_recipients_user_id')
  await knex.raw('DROP INDEX IF EXISTS idx_user_challenges_user_id')
  await knex.raw('DROP INDEX IF EXISTS idx_group_members_user_id')
  await knex.raw('DROP INDEX IF EXISTS idx_votes_session_id')
  await knex.raw('DROP INDEX IF EXISTS idx_votes_user_id')
}
