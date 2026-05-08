import type { Knex } from 'knex'

/**
 * Stripe review (2026-05-08) follow-ups, schema side.
 *
 * Adds:
 * - subscriptions.cancel_at_period_end — surfaces the cancellation intent
 *   without flipping `status` to `canceled` while the user has still paid
 *   through `current_period_end`. Fixes A2 in the review.
 * - subscriptions.past_due_since — captured only on the transition into
 *   past_due, so the reconciler grace cutoff isn't reset by every Stripe
 *   dunning retry that bumps `updated_at`. Fixes B2.
 * - stripe_events.status / processing_error / last_attempted_at — gives
 *   the webhook handler space to record per-event outcome, lets the
 *   reconciler retry events that failed transiently, and powers the
 *   /admin/subscription-health endpoint. Fixes A1, A11, D5.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('subscriptions', (table) => {
    table.boolean('cancel_at_period_end').notNullable().defaultTo(false)
    table.timestamp('past_due_since', { useTz: true }).nullable()
  })

  await knex.schema.alterTable('stripe_events', (table) => {
    table.string('status', 16).notNullable().defaultTo('success')
    table.text('processing_error').nullable()
    table.timestamp('last_attempted_at', { useTz: true }).defaultTo(knex.fn.now())
    table.integer('attempt_count').notNullable().defaultTo(1)

    table.index(['status', 'processed_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stripe_events', (table) => {
    table.dropIndex(['status', 'processed_at'])
    table.dropColumn('attempt_count')
    table.dropColumn('last_attempted_at')
    table.dropColumn('processing_error')
    table.dropColumn('status')
  })

  await knex.schema.alterTable('subscriptions', (table) => {
    table.dropColumn('past_due_since')
    table.dropColumn('cancel_at_period_end')
  })
}
