import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('discord_guild_settings', (table) => {
    table.string('guild_id', 32).primary()
    table.string('friday_schedule', 64).nullable()
    table.string('wednesday_schedule', 64).nullable()
    table.string('schedule_timezone', 64).nullable()
    table.string('updated_by_discord_id', 32).nullable()
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('discord_guild_settings')
}
