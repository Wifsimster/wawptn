import type { Knex } from 'knex'

/**
 * "New game spotlight" — when a member's Steam library sync detects a freshly
 * acquired game, WAWPTN announces it into the group's linked Discord ("X vient
 * d'ajouter Y, qui veut jouer ?") and opens an interactive vote on the new
 * game(s). The feature is free but owner-opt-in: auto-posting into someone's
 * Discord without consent is a trust violation, so it defaults to disabled.
 *
 * `groups.new_game_spotlight_enabled` is the per-group toggle (mirrors the
 * per-group `releases_digest_enabled` flag).
 *
 * `group_game_spotlights` is the idempotency ledger: a given canonical game is
 * promoted into a given group at most once, ever. The PK on
 * `(group_id, game_id)` plus an `onConflict().ignore()` claim means a re-sync,
 * a second member acquiring the same game, or a second backend instance can
 * never double-post the same spotlight.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.boolean('new_game_spotlight_enabled').notNullable().defaultTo(false)
  })

  await knex.schema.createTable('group_game_spotlights', (table) => {
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
    // Kept for convenience (Steam links, logging) so consumers don't have to
    // join back through game_platform_ids just to build a store URL.
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
