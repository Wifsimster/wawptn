import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Use IF NOT EXISTS guards because epic_games_support may have already created some of these
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_provider_id_account_id_unique'
      ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_provider_id_account_id_unique UNIQUE (provider_id, account_id);
      END IF;
    END $$;
  `)
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_provider_id_unique'
      ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_provider_id_unique UNIQUE (user_id, provider_id);
      END IF;
    END $$;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('accounts', (table) => {
    table.dropUnique(['provider_id', 'account_id'])
    table.dropUnique(['user_id', 'provider_id'])
  })
}
