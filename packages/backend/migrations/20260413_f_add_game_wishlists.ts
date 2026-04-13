import type { Knex } from 'knex'

/**
 * Game wishlist: lets a user mark games they want to play soon without
 * committing to a vote yes. Surfaces as a filter / sort signal on the
 * group game grid and will later feed the vote session setup dialog as
 * a "suggested games" hint (Sarah #3 from the multi-persona meeting).
 *
 * Scoped per-user, not per-group — a user's wishlist is a personal
 * preference that applies to every group they're a member of.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('game_wishlists', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    // We key the wishlist on steam_app_id because it's the canonical game
    // identifier already used by user_games / voting_session_games. Epic
    // and GOG games surface through the same steam_app_id mapping once
    // the Marcus #1 IGDB dedup ships, so the wishlist will naturally
    // cover cross-platform libraries without schema changes.
    table.integer('steam_app_id').notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.primary(['user_id', 'steam_app_id'])
    table.index('user_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_wishlists')
}
