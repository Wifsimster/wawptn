import type { Knex } from 'knex'

/**
 * Phase 2: Generalize game schema from Steam-specific to platform-agnostic.
 *
 * Creates a canonical `games` table and `game_platform_ids` junction table.
 * Migrates user_games, voting_session_games, votes, voting_sessions, and game_metadata
 * from steam_app_id to game_id references.
 *
 * This is a multi-step additive migration:
 * 1. Create new tables (games, game_platform_ids)
 * 2. Populate games from existing steam_app_id data
 * 3. Add game_id columns alongside steam_app_id
 * 4. Backfill game_id from games table
 * 5. Add platform column to user_games for multi-platform support
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Create canonical games table
  await knex.schema.createTable('games', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('canonical_name').notNullable()
    table.string('cover_image_url')
    table.timestamps(true, true)
  })

  // 2. Create game_platform_ids junction table (maps canonical game to platform-specific IDs)
  await knex.schema.createTable('game_platform_ids', (table) => {
    table.uuid('game_id').notNullable().references('id').inTable('games').onDelete('CASCADE')
    table.string('platform').notNullable() // 'steam', 'battlenet', 'epic', 'gog', 'ubisoft'
    table.string('platform_game_id').notNullable() // e.g. '570' for Dota 2 on Steam
    table.timestamps(true, true)

    table.primary(['game_id', 'platform', 'platform_game_id'])
    table.unique(['platform', 'platform_game_id'])
  })

  // 3. Populate games from existing user_games (unique steam_app_id entries)
  await knex.raw(`
    INSERT INTO games (id, canonical_name, cover_image_url, created_at, updated_at)
    SELECT gen_random_uuid(), game_name, header_image_url, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (steam_app_id) steam_app_id, game_name, header_image_url
      FROM user_games
      ORDER BY steam_app_id, synced_at DESC
    ) AS distinct_games
  `)

  // 4. Create platform ID mappings for all Steam games
  await knex.raw(`
    INSERT INTO game_platform_ids (game_id, platform, platform_game_id, created_at, updated_at)
    SELECT g.id, 'steam', dg.steam_app_id::text, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (steam_app_id) steam_app_id, game_name
      FROM user_games
      ORDER BY steam_app_id, synced_at DESC
    ) AS dg
    JOIN games g ON g.canonical_name = dg.game_name
  `)

  // Also add games from voting_session_games that might not be in user_games
  await knex.raw(`
    INSERT INTO games (id, canonical_name, cover_image_url, created_at, updated_at)
    SELECT gen_random_uuid(), vsg.game_name, vsg.header_image_url, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (steam_app_id) steam_app_id, game_name, header_image_url
      FROM voting_session_games
      ORDER BY steam_app_id
    ) AS vsg
    WHERE NOT EXISTS (
      SELECT 1 FROM game_platform_ids gpi
      WHERE gpi.platform = 'steam' AND gpi.platform_game_id = vsg.steam_app_id::text
    )
  `)

  await knex.raw(`
    INSERT INTO game_platform_ids (game_id, platform, platform_game_id, created_at, updated_at)
    SELECT g.id, 'steam', vsg.steam_app_id::text, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (steam_app_id) steam_app_id, game_name
      FROM voting_session_games
      ORDER BY steam_app_id
    ) AS vsg
    JOIN games g ON g.canonical_name = vsg.game_name
    WHERE NOT EXISTS (
      SELECT 1 FROM game_platform_ids gpi
      WHERE gpi.platform = 'steam' AND gpi.platform_game_id = vsg.steam_app_id::text
    )
  `)

  // 5. Add game_id column to user_games
  await knex.schema.alterTable('user_games', (table) => {
    table.uuid('game_id').nullable().references('id').inTable('games').onDelete('CASCADE')
    table.string('platform').defaultTo('steam')
  })

  // Backfill game_id in user_games
  await knex.raw(`
    UPDATE user_games ug
    SET game_id = gpi.game_id
    FROM game_platform_ids gpi
    WHERE gpi.platform = 'steam'
      AND gpi.platform_game_id = ug.steam_app_id::text
  `)

  // 6. Add game_id column to voting_session_games
  await knex.schema.alterTable('voting_session_games', (table) => {
    table.uuid('game_id').nullable().references('id').inTable('games').onDelete('CASCADE')
  })

  await knex.raw(`
    UPDATE voting_session_games vsg
    SET game_id = gpi.game_id
    FROM game_platform_ids gpi
    WHERE gpi.platform = 'steam'
      AND gpi.platform_game_id = vsg.steam_app_id::text
  `)

  // 7. Add game_id column to votes
  await knex.schema.alterTable('votes', (table) => {
    table.uuid('game_id').nullable().references('id').inTable('games').onDelete('CASCADE')
  })

  await knex.raw(`
    UPDATE votes v
    SET game_id = gpi.game_id
    FROM game_platform_ids gpi
    WHERE gpi.platform = 'steam'
      AND gpi.platform_game_id = v.steam_app_id::text
  `)

  // 8. Add game_id column to voting_sessions (winning game)
  await knex.schema.alterTable('voting_sessions', (table) => {
    table.uuid('winning_game_id').nullable().references('id').inTable('games').onDelete('SET NULL')
  })

  await knex.raw(`
    UPDATE voting_sessions vs
    SET winning_game_id = gpi.game_id
    FROM game_platform_ids gpi
    WHERE vs.winning_game_app_id IS NOT NULL
      AND gpi.platform = 'steam'
      AND gpi.platform_game_id = vs.winning_game_app_id::text
  `)

  // 9. Add game_id column to game_metadata
  await knex.schema.alterTable('game_metadata', (table) => {
    table.uuid('game_id').nullable().references('id').inTable('games').onDelete('CASCADE')
  })

  await knex.raw(`
    UPDATE game_metadata gm
    SET game_id = gpi.game_id
    FROM game_platform_ids gpi
    WHERE gpi.platform = 'steam'
      AND gpi.platform_game_id = gm.steam_app_id::text
  `)

  // 10. Make users.steam_id nullable (future email-only users won't have one)
  await knex.raw(`ALTER TABLE users ALTER COLUMN steam_id DROP NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  // Restore steam_id NOT NULL
  await knex.raw(`ALTER TABLE users ALTER COLUMN steam_id SET NOT NULL`)

  // Remove game_id columns
  await knex.schema.alterTable('game_metadata', (table) => {
    table.dropColumn('game_id')
  })

  await knex.schema.alterTable('voting_sessions', (table) => {
    table.dropColumn('winning_game_id')
  })

  await knex.schema.alterTable('votes', (table) => {
    table.dropColumn('game_id')
  })

  await knex.schema.alterTable('voting_session_games', (table) => {
    table.dropColumn('game_id')
  })

  await knex.schema.alterTable('user_games', (table) => {
    table.dropColumn('game_id')
    table.dropColumn('platform')
  })

  await knex.schema.dropTableIfExists('game_platform_ids')
  await knex.schema.dropTableIfExists('games')
}
