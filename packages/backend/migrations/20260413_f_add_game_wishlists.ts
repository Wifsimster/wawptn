import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('game_wishlists', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('steam_app_id').notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'steam_app_id'])
    table.index('user_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_wishlists')
}
