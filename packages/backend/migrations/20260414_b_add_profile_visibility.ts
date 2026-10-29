import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_games_sync_at').nullable()
    table.boolean('visibility_full_library').notNullable().defaultTo(false)
    table.boolean('visibility_last_played').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_games_sync_at')
    table.dropColumn('visibility_full_library')
    table.dropColumn('visibility_last_played')
  })
}
