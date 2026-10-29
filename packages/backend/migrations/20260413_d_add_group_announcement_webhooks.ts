import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_announcement_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.text('webhook_url').notNullable()
    table.string('label', 64).nullable()
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index('group_id')
    table.unique(['group_id', 'webhook_url'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_announcement_webhooks')
}
