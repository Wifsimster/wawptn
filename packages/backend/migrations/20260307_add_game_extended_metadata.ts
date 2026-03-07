import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_metadata', (table) => {
    table.string('type', 50).nullable()
    table.text('short_description').nullable()
    table.jsonb('platforms').nullable()
    table.integer('recommendations_total').nullable()
    table.date('release_date').nullable()
    table.boolean('coming_soon').nullable()
    table.string('controller_support', 20).nullable()
    table.boolean('is_free').nullable()
    table.jsonb('content_descriptors').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('game_metadata', (table) => {
    table.dropColumn('type')
    table.dropColumn('short_description')
    table.dropColumn('platforms')
    table.dropColumn('recommendations_total')
    table.dropColumn('release_date')
    table.dropColumn('coming_soon')
    table.dropColumn('controller_support')
    table.dropColumn('is_free')
    table.dropColumn('content_descriptors')
  })
}
