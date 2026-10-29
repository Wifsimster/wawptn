import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('subscriptions', (table) => {
    table.string('price_id').nullable()
    table.integer('amount_cents').nullable()
    table.string('currency', 3).nullable()
  })

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS subscriptions_orphan_customers_idx
    ON subscriptions (stripe_customer_id)
    WHERE stripe_subscription_id IS NULL AND stripe_customer_id IS NOT NULL
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS subscriptions_past_due_since_idx
    ON subscriptions (past_due_since)
    WHERE status = 'past_due' AND past_due_since IS NOT NULL
  `)

  await knex.raw(`
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_amount_nonneg
    CHECK (amount_cents IS NULL OR amount_cents >= 0)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_amount_nonneg')
  await knex.raw('DROP INDEX IF EXISTS subscriptions_past_due_since_idx')
  await knex.raw('DROP INDEX IF EXISTS subscriptions_orphan_customers_idx')
  await knex.schema.alterTable('subscriptions', (table) => {
    table.dropColumn('currency')
    table.dropColumn('amount_cents')
    table.dropColumn('price_id')
  })
}
