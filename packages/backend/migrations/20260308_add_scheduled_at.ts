import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.timestamp('scheduled_at').nullable()
  })
  // Partial index for the scheduler query — only open sessions with a schedule
  await knex.raw(`
    CREATE INDEX idx_voting_sessions_scheduled_close
    ON voting_sessions (scheduled_at)
    WHERE status = 'open' AND scheduled_at IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_voting_sessions_scheduled_close')
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.dropColumn('scheduled_at')
  })
}
