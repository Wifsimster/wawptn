import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add is_admin column to users table
  await knex.schema.alterTable('users', (table) => {
    table.boolean('is_admin').notNullable().defaultTo(false)
  })

  // Create app_settings table for runtime-configurable settings (bot config, etc.)
  await knex.schema.createTable('app_settings', (table) => {
    table.string('key', 100).primary()
    table.jsonb('value').notNullable()
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  // Seed default bot settings
  await knex('app_settings').insert([
    { key: 'bot.persona_rotation_enabled', value: JSON.stringify(true) },
    { key: 'bot.friday_schedule', value: JSON.stringify('0 21 * * 5') },
    { key: 'bot.wednesday_schedule', value: JSON.stringify('0 17 * * 3') },
    { key: 'bot.schedule_timezone', value: JSON.stringify('Europe/Paris') },
  ])
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_admin')
  })
}
