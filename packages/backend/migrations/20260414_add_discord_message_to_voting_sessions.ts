import type { Knex } from 'knex'

/**
 * Adds the columns needed for bidirectional Discord voting.
 *
 * - `discord_message_id`: the snowflake of the interactive message the bot
 *   posted when the session opened. Required so the backend can ask the bot
 *   to later edit the same message (live vote counts, winner reveal) and to
 *   disable its vote buttons on close.
 * - `discord_channel_id`: snapshot of the channel the bot posted to. Cached
 *   on the session row so that we don't have to re-resolve the group's
 *   `discord_channel_id` on every live update — the group's linked channel
 *   may legitimately change mid-session without invalidating in-flight
 *   messages.
 */
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
