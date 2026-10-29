import type { Knex } from 'knex'

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
