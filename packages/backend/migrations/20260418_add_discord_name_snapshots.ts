import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.text('discord_guild_name').nullable()
    table.text('discord_channel_name').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('discord_guild_name')
    table.dropColumn('discord_channel_name')
  })
}
