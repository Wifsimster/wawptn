import type { Knex } from 'knex'

/**
 * Per-Discord-guild bot config overrides. The global defaults live in
 * `app_settings` (keys `bot.friday_schedule`, `bot.wednesday_schedule`,
 * `bot.schedule_timezone`); this table lets community owners override
 * just those values for their own guild via the /wawptn-config slash
 * command.
 *
 * Implements Tom #2 from the multi-persona feature meeting.
 *
 * Any column set to null means "inherit the global default". Columns
 * that hold a non-null value are the active per-guild override.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('discord_guild_settings', (table) => {
    // The Discord guild ID is the natural key. We don't join this to any
    // internal users/groups table — it's just a bag of overrides keyed
    // on a snowflake ID.
    table.string('guild_id', 32).primary()
    table.string('friday_schedule', 64).nullable()
    table.string('wednesday_schedule', 64).nullable()
    table.string('schedule_timezone', 64).nullable()
    // Audit metadata — who flipped the switch last, via /wawptn-config.
    table.string('updated_by_discord_id', 32).nullable()
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('discord_guild_settings')
}
