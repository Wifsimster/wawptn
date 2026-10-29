import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.timestamp('archived_at').nullable()
    table.index('archived_at')
  })

  await knex.schema.createTable('group_bans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('discord_id').nullable()
    table.uuid('banned_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.text('reason').nullable()
    table.timestamp('banned_at').notNullable().defaultTo(knex.fn.now())

    table.index(['group_id', 'user_id'])
    table.index(['group_id', 'discord_id'])
  })

  await knex.raw(`
    CREATE UNIQUE INDEX group_bans_group_user_unique
      ON group_bans (group_id, user_id)
      WHERE user_id IS NOT NULL
  `)
  await knex.raw(`
    CREATE UNIQUE INDEX group_bans_group_discord_unique
      ON group_bans (group_id, discord_id)
      WHERE discord_id IS NOT NULL
  `)

  await knex.schema.createTable('discord_auth_intents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('nonce', 64).notNullable().unique()
    table.string('discord_id').notNullable()
    table.string('discord_username').notNullable()
    table.string('discord_channel_id').notNullable()
    table.string('discord_guild_id').notNullable()
    table.string('channel_name').nullable()
    table.timestamp('expires_at').notNullable()
    table.timestamp('consumed_at').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index('expires_at')
    table.index(['discord_id', 'consumed_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('discord_auth_intents')
  await knex.raw('DROP INDEX IF EXISTS group_bans_group_discord_unique')
  await knex.raw('DROP INDEX IF EXISTS group_bans_group_user_unique')
  await knex.schema.dropTableIfExists('group_bans')
  await knex.schema.alterTable('groups', (table) => {
    table.dropIndex('archived_at')
    table.dropColumn('archived_at')
  })
}
