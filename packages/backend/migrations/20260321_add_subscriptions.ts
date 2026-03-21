import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE')
    table.string('stripe_customer_id').unique()
    table.string('stripe_subscription_id').unique()
    table.string('tier', 20).notNullable().defaultTo('free').checkIn(['free', 'premium'])
    table.string('status', 20).notNullable().defaultTo('inactive').checkIn(['active', 'past_due', 'canceled', 'inactive'])
    table.timestamp('current_period_end', { useTz: true })
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('stripe_events', (table) => {
    table.string('event_id').primary()
    table.string('event_type').notNullable()
    table.timestamp('processed_at', { useTz: true }).defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stripe_events')
  await knex.schema.dropTableIfExists('subscriptions')
}
