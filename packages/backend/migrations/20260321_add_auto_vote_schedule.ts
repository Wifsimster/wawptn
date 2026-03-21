import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.string('auto_vote_schedule', 50).nullable()
    table.integer('auto_vote_duration_minutes').nullable().defaultTo(120)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('auto_vote_schedule')
    table.dropColumn('auto_vote_duration_minutes')
  })
}
