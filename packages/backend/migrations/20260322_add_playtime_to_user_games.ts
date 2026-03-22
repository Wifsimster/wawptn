import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_games', (table) => {
    table.integer('playtime_forever').nullable().defaultTo(null)
    table.integer('playtime_2weeks').nullable().defaultTo(null)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_games', (table) => {
    table.dropColumn('playtime_forever')
    table.dropColumn('playtime_2weeks')
  })
}
