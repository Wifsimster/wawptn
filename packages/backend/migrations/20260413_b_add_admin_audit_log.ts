import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.uuid('target_user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('action', 64).notNullable()
    table.jsonb('metadata').notNullable().defaultTo('{}')
    table.string('ip_address', 64).nullable()
    table.string('user_agent', 512).nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index(['actor_id', 'created_at'])
    table.index(['target_user_id', 'created_at'])
    table.index(['action', 'created_at'])
    table.index('created_at')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_audit_log')
}
