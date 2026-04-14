import type { Knex } from 'knex'

/**
 * Profile comparison feature — adds the columns that power the
 * "view another user's profile" / "compare with me" flows.
 *
 * Design notes (see meeting CR in issue #142):
 *
 * - `last_games_sync_at`: surfaces freshness honestly in the UI so that
 *   "why does X have 0h on Helldivers?" can be answered by the cron
 *   cadence rather than filed as a bug.
 *
 * - `visibility_full_library` / `visibility_last_played`: Marine's
 *   compromise on the privacy tension. Stats scoped to *common games*
 *   stay visible by default (implicit consent via the existing
 *   group-level intersection), while the full library and the
 *   per-game "last played" timestamps require an explicit opt-in.
 *
 * Both visibility flags default to `false` — that's Julien's red line.
 * Users opt in from their own profile settings page.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_games_sync_at').nullable()
    table.boolean('visibility_full_library').notNullable().defaultTo(false)
    table.boolean('visibility_last_played').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_games_sync_at')
    table.dropColumn('visibility_full_library')
    table.dropColumn('visibility_last_played')
  })
}
