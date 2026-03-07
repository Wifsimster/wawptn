import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_metadata', (table) => {
    table.jsonb('genres').nullable()
    table.integer('metacritic_score').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_metadata', (table) => {
    table.dropColumn('genres')
    table.dropColumn('metacritic_score')
  })
}
