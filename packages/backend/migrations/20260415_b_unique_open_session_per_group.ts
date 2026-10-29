import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
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
