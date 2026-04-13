import type { Knex } from 'knex'

/**
 * Admin-granted premium: admins can grant premium access to any user
 * without going through Stripe. This flag lives on the users table so
 * it can never be clobbered by Stripe webhook updates on the
 * `subscriptions` row.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('admin_granted_premium').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('admin_granted_premium')
  })
}
