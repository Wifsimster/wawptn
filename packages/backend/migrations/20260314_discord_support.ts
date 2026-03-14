import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Discord link codes (temporary, for account linking flow)
  await knex.schema.createTable('discord_link_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.string('code', 8).notNullable().unique()
    table.string('discord_id').notNullable()
    table.string('discord_username').notNullable()
    table.timestamp('expires_at').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })

  // Discord user links (permanent mapping)
  await knex.schema.createTable('discord_links', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('discord_id').notNullable().unique()
    table.string('discord_username').notNullable()
    table.timestamp('linked_at').defaultTo(knex.fn.now())
    table.primary(['user_id'])
  })

  // Add Discord channel binding to groups
  await knex.schema.alterTable('groups', (table) => {
    table.string('discord_channel_id').nullable()
    table.string('discord_guild_id').nullable()
    table.text('discord_webhook_url').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('groups', (table) => {
    table.dropColumn('discord_channel_id')
    table.dropColumn('discord_guild_id')
    table.dropColumn('discord_webhook_url')
  })
  await knex.schema.dropTableIfExists('discord_links')
  await knex.schema.dropTableIfExists('discord_link_codes')
}
