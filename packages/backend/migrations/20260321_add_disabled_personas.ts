import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex('app_settings')
    .insert({ key: 'bot.disabled_personas', value: JSON.stringify([]) })
    .onConflict('key')
    .ignore()
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').where({ key: 'bot.disabled_personas' }).del()
}
