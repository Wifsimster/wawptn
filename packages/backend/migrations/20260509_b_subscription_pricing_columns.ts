import type { Knex } from 'knex'

/**
 * Subscription pricing snapshot + orphan-customer index.
 *
 * The original schema stored a status flag without recording the price
 * the user is on. If pricing changes (or A/B variants ship) we can't
 * tell which plan a row was billed on without going back to Stripe row
 * by row. Add a snapshot of the price the subscription was last seen on:
 * - price_id      : Stripe price ID (e.g. price_1234)
 * - amount_cents  : integer cents (Stripe canonical money format —
 *                   never NUMERIC/float for money)
 * - currency      : 3-letter ISO 4217 code, lower-case as Stripe sends
 *
 * Webhook handlers and the reconciler populate these alongside tier/
 * status whenever a Subscription is read from Stripe.
 *
 * Plus a partial index on the orphan-customer query in the reconciler
 * (WHERE stripe_customer_id IS NOT NULL AND stripe_subscription_id IS
 * NULL). The unique index on stripe_customer_id helps but Postgres won't
 * use it with the additional NULL predicate on stripe_subscription_id;
 * a partial index keyed on stripe_subscription_id IS NULL scales better
 * once the user count grows.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('subscriptions', (table) => {
    table.string('price_id').nullable()
    table.integer('amount_cents').nullable()
    table.string('currency', 3).nullable()
  })

  // Partial index to support the reconciler's orphan-repair query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS subscriptions_orphan_customers_idx
    ON subscriptions (stripe_customer_id)
    WHERE stripe_subscription_id IS NULL AND stripe_customer_id IS NOT NULL
  `)

  // Index to support the reconciler's grace-period downgrade query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS subscriptions_past_due_since_idx
    ON subscriptions (past_due_since)
    WHERE status = 'past_due' AND past_due_since IS NOT NULL
  `)

  // amount_cents must be non-negative if set; currency must be 3 chars
  // when set. Either both pricing columns are present or all are null
  // (a new row that has only seen the customer-create call).
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
