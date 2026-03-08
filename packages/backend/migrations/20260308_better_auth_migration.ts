import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // 1. Add email_verified to users (required by Better Auth)
  await knex.schema.alterTable('users', (table) => {
    table.boolean('email_verified').defaultTo(false)
  })

  // 2. Backfill placeholder emails for users without one
  await knex.raw(`
    UPDATE users
    SET email = steam_id || '@steam.wawptn.app'
    WHERE email IS NULL
  `)

  // 3. Add ip_address, user_agent to sessions (Better Auth tracks these)
  await knex.schema.alterTable('sessions', (table) => {
    table.string('ip_address').nullable()
    table.string('user_agent', 512).nullable()
  })

  // 4. Create accounts table (Better Auth provider accounts)
  await knex.schema.createTable('accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('provider_id').notNullable()
    table.string('account_id').notNullable()
    table.text('access_token').nullable()
    table.text('refresh_token').nullable()
    table.text('id_token').nullable()
    table.timestamp('access_token_expires_at').nullable()
    table.timestamp('refresh_token_expires_at').nullable()
    table.string('scope').nullable()
    table.string('password').nullable()
    table.timestamps(true, true)
  })

  // 5. Create verifications table (for email verification, password reset)
  await knex.schema.createTable('verifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('identifier').notNullable()
    table.string('value').notNullable()
    table.timestamp('expires_at').notNullable()
    table.timestamps(true, true)
  })

  // 6. Backfill: create account entries for existing Steam users
  const users = await knex('users').select('id', 'steam_id')
  for (const user of users) {
    if (user.steam_id) {
      await knex('accounts').insert({
        user_id: user.id,
        provider_id: 'steam',
        account_id: user.steam_id,
      })
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('verifications')
  await knex.schema.dropTableIfExists('accounts')

  await knex.schema.alterTable('sessions', (table) => {
    table.dropColumn('ip_address')
    table.dropColumn('user_agent')
  })

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('email_verified')
  })
}
