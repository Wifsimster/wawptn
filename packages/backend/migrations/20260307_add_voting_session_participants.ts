import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('voting_session_participants', (table) => {
    table.uuid('session_id').notNullable().references('id').inTable('voting_sessions').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.primary(['session_id', 'user_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('voting_session_participants')
}
