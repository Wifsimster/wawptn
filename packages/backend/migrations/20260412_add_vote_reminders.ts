import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.timestamp('reminder_sent_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.dropColumn('reminder_sent_at')
  })
}
