import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Daily challenge rolled per group per day
  await knex.schema.createTable('discord_daily_challenges', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.date('challenge_date').notNullable()
    table.integer('steam_app_id').notNullable()
    table.text('game_id').nullable()
    table.text('game_name').notNullable()
    table.text('header_image_url').nullable()
    table.text('discord_channel_id').notNullable()
    table.text('discord_message_id').nullable()
    table.uuid('created_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    table.unique(['group_id', 'challenge_date'])
  })

  // Claims (one per user per challenge)
  await knex.schema.createTable('discord_daily_challenge_claims', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('challenge_id').notNullable().references('id').inTable('discord_daily_challenges').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('claimed_at', { useTz: true }).defaultTo(knex.fn.now())

    table.unique(['challenge_id', 'user_id'])
  })

  await knex.raw(
    'CREATE INDEX idx_daily_challenges_group_date ON discord_daily_challenges(group_id, challenge_date DESC)'
  )
  await knex.raw(
    'CREATE INDEX idx_daily_challenge_claims_user ON discord_daily_challenge_claims(user_id)'
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('discord_daily_challenge_claims')
  await knex.schema.dropTableIfExists('discord_daily_challenges')
}
