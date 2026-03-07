import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Users
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('steam_id').unique().notNullable()
    table.string('display_name').notNullable()
    table.string('avatar_url')
    table.string('profile_url')
    table.string('email')
    table.boolean('library_visible').defaultTo(true)
    table.timestamps(true, true)
  })

  // Sessions (for auth)
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('token').unique().notNullable()
    table.timestamp('expires_at').notNullable()
    table.timestamps(true, true)

    table.index('token')
    table.index('expires_at')
  })

  // Groups
  await knex.schema.createTable('groups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name').notNullable()
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('invite_token_hash')
    table.timestamp('invite_expires_at')
    table.integer('invite_use_count').defaultTo(0)
    table.integer('invite_max_uses').defaultTo(10)
    table.integer('common_game_threshold').nullable()
    table.timestamps(true, true)
  })

  // Group members
  await knex.schema.createTable('group_members', (table) => {
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.enum('role', ['owner', 'member']).defaultTo('member')
    table.timestamp('joined_at').defaultTo(knex.fn.now())

    table.primary(['group_id', 'user_id'])
  })

  // User games (Steam library cache)
  await knex.schema.createTable('user_games', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('steam_app_id').notNullable()
    table.string('game_name').notNullable()
    table.string('header_image_url')
    table.timestamp('synced_at').defaultTo(knex.fn.now())

    table.primary(['user_id', 'steam_app_id'])
  })

  // Voting sessions
  await knex.schema.createTable('voting_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.enum('status', ['open', 'closed']).defaultTo('open')
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('winning_game_app_id')
    table.string('winning_game_name')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('closed_at')

    table.index(['group_id', 'status'])
  })

  // Games selected for a voting session
  await knex.schema.createTable('voting_session_games', (table) => {
    table.uuid('session_id').notNullable().references('id').inTable('voting_sessions').onDelete('CASCADE')
    table.integer('steam_app_id').notNullable()
    table.string('game_name').notNullable()
    table.string('header_image_url')

    table.primary(['session_id', 'steam_app_id'])
  })

  // Votes
  await knex.schema.createTable('votes', (table) => {
    table.uuid('session_id').notNullable().references('id').inTable('voting_sessions').onDelete('CASCADE')
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.integer('steam_app_id').notNullable()
    table.boolean('vote').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['session_id', 'user_id', 'steam_app_id'])
    table.index(['session_id'])
  })

  // Game metadata (Steam store enrichment)
  await knex.schema.createTable('game_metadata', (table) => {
    table.integer('steam_app_id').primary()
    table.jsonb('categories').nullable()
    table.boolean('is_multiplayer').nullable()
    table.boolean('is_coop').nullable()
    table.timestamp('enriched_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('game_metadata')
  await knex.schema.dropTableIfExists('votes')
  await knex.schema.dropTableIfExists('voting_session_games')
  await knex.schema.dropTableIfExists('voting_sessions')
  await knex.schema.dropTableIfExists('user_games')
  await knex.schema.dropTableIfExists('group_members')
  await knex.schema.dropTableIfExists('groups')
  await knex.schema.dropTableIfExists('sessions')
  await knex.schema.dropTableIfExists('users')
}
