import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.boolean('new_game_spotlight_enabled').notNullable().defaultTo(false)
  })

  await knex.schema.createTable('group_game_spotlights', (table) => {
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
    table.integer('steam_app_id').nullable()
    table.timestamp('posted_at').notNullable().defaultTo(knex.fn.now())

    table.primary(['group_id', 'game_id'])
    table.index('group_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_game_spotlights')
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('new_game_spotlight_enabled')
  })
}
