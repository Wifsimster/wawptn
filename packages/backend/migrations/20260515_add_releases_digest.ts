import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.boolean('releases_digest_enabled').notNullable().defaultTo(false)
    table.string('releases_digest_schedule', 50).notNullable().defaultTo('0 21 * * 5')
    table.boolean('releases_digest_coop_only').notNullable().defaultTo(false)
    table.string('releases_digest_last_iso_week', 8).nullable()
    table.timestamp('releases_digest_last_posted_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('releases_digest_enabled')
    table.dropColumn('releases_digest_schedule')
    table.dropColumn('releases_digest_coop_only')
    table.dropColumn('releases_digest_last_iso_week')
    table.dropColumn('releases_digest_last_posted_at')
  })
}
