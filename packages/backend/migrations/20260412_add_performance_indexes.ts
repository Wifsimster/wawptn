import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_votes_user_id
    ON votes (user_id)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_votes_session_id
    ON votes (session_id)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id
    ON group_members (user_id)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_user_challenges_user_id
    ON user_challenges (user_id)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id
    ON notification_recipients (user_id)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_notification_recipients_read_at
    ON notification_recipients (read_at)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_voting_sessions_group_id_status
    ON voting_sessions (group_id, status)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_voting_session_participants_session_id
    ON voting_session_participants (session_id)
  `)

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
