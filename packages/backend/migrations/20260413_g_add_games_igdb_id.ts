import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.bigInteger('igdb_id').nullable()
    table.index('igdb_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('games', (table) => {
    table.dropIndex('igdb_id')
    table.dropColumn('igdb_id')
  })
}
