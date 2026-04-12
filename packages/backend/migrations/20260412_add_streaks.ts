import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('streaks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.integer('current_streak').notNullable().defaultTo(0)
    table.integer('best_streak').notNullable().defaultTo(0)
    table.uuid('last_session_id').nullable().references('id').inTable('voting_sessions').onDelete('SET NULL')
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.unique(['user_id', 'group_id'])
    table.index('user_id')
    table.index('group_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('streaks')
}
