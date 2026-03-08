import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add status column to accounts table for token lifecycle management
  await knex.schema.alterTable('accounts', (table) => {
    table.string('status').defaultTo('active')
  })

  // Add unique constraint for user+provider to prevent duplicate account links
  // Use raw SQL to handle the case where the constraint might already exist
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_provider_id_unique'
      ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_provider_id_unique UNIQUE (user_id, provider_id);
      END IF;
    END $$;
  `)

  // Add composite unique constraint for user_games to support multi-platform dedup
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_games_user_id_game_id_platform_unique'
      ) THEN
        ALTER TABLE user_games ADD CONSTRAINT user_games_user_id_game_id_platform_unique UNIQUE (user_id, game_id, platform);
      END IF;
    END $$;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE user_games DROP CONSTRAINT IF EXISTS user_games_user_id_game_id_platform_unique')
  await knex.raw('ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_provider_id_unique')
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('status')
  })
}
