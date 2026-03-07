import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('game_metadata', (table) => {
    table.integer('steam_app_id').primary()
    table.jsonb('categories').nullable()
    table.boolean('is_multiplayer').nullable()
    table.boolean('is_coop').nullable()
    table.timestamp('enriched_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_metadata')
}
