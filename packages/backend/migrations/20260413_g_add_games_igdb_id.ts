import type { Knex } from 'knex'

/**
 * Add `igdb_id` column to the `games` table so a future IGDB integration
 * can attach the canonical IGDB id to each canonical game row. Leaving the
 * column nullable for now — this PR does not call the IGDB API, it just
 * reserves the slot so the follow-up PR that adds the client code only
 * needs to populate the column.
 *
 * Implements the first half of Marcus #1 from the multi-persona feature
 * meeting. The immediate cross-platform dedupe win ships via the domain
 * utility in game-dedupe.ts which merges duplicate canonical games by
 * normalized name; the `igdb_id` column makes that migration safer by
 * offering a stronger matching signal once the API client exists.
 */
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
