import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('accounts', (table) => {
    // Prevent the same external account from being linked to multiple WAWPTN users
    table.unique(['provider_id', 'account_id'])
    // Prevent a user from linking the same provider twice
    table.unique(['user_id', 'provider_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('accounts', (table) => {
    table.dropUnique(['provider_id', 'account_id'])
    table.dropUnique(['user_id', 'provider_id'])
  })
}
