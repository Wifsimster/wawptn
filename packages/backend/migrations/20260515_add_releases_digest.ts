import type { Knex } from 'knex'

/**
 * Per-group configuration for the weekly Steam new-releases digest: a
 * scheduled post (default Friday 21:00 Europe/Paris) listing the week's
 * newest co-op / multiplayer Steam releases into the group's linked
 * Discord channel.
 *
 * Mirrors the per-group `auto_vote_schedule` columns — this is per-group
 * config, so it lives on `groups` rather than in a side table.
 *
 * `releases_digest_last_iso_week` is the idempotency guard: a given ISO
 * week (e.g. `2026-W20`) is claimed at most once per group via an atomic
 * conditional UPDATE, so an overlapping scheduler tick or a second backend
 * instance can never double-post the same digest.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.boolean('releases_digest_enabled').notNullable().defaultTo(false)
    table.string('releases_digest_schedule', 50).notNullable().defaultTo('0 21 * * 5')
    // false = both co-op and multiplayer releases; true = co-op only.
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
