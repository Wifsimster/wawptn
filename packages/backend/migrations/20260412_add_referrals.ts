import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('referrals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('referrer_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('referred_user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE')
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    table.index('referrer_user_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('referrals')
}
