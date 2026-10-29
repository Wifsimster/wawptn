import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table
      .uuid('admin_granted_premium_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL')
    table.timestamp('admin_granted_premium_at', { useTz: true }).nullable()
  })

  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_admin_grant_metadata_consistent
    CHECK (
      (admin_granted_premium_by IS NULL AND admin_granted_premium_at IS NULL)
      OR
      (admin_granted_premium_by IS NOT NULL AND admin_granted_premium_at IS NOT NULL
       AND admin_granted_premium = true)
    )
  `)

  await knex.raw(`
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_active_has_period_end
    CHECK (
      status <> 'active' OR current_period_end IS NOT NULL
    )
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_active_has_period_end')
  await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_grant_metadata_consistent')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('admin_granted_premium_at')
    table.dropColumn('admin_granted_premium_by')
  })
}
