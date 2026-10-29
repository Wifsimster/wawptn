import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.string('discord_message_id').nullable()
    table.string('discord_channel_id').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.dropColumn('discord_message_id')
    table.dropColumn('discord_channel_id')
  })
}
