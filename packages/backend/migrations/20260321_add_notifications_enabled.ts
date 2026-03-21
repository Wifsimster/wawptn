import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('group_members', (table) => {
    table.boolean('notifications_enabled').notNullable().defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('group_members', (table) => {
    table.dropColumn('notifications_enabled')
  })
}
