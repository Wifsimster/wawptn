import type { Knex } from 'knex'

/**
 * Snapshot the Discord guild and channel names alongside the IDs so the UI
 * can show "linked to #general on MyServer" without a runtime Discord API
 * call. Names are written when `/wawptn-setup` runs; existing bound groups
 * keep null names until the command is run again (the frontend shows a
 * generic "Discord lié" fallback in the meantime).
 */
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
