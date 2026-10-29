import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('session_audit_trail', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('session_id').notNullable().references('id').inTable('voting_sessions').onDelete('CASCADE')
    table.string('event_type', 32).notNullable()
    table.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.jsonb('metadata').notNullable().defaultTo('{}')
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index(['session_id', 'created_at'])
    table.index(['event_type', 'created_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('session_audit_trail')
}
