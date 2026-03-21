import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex('app_settings')
    .insert({ key: 'bot.announce_persona_change', value: JSON.stringify(false) })
    .onConflict('key')
    .ignore()
}

export async function down(knex: Knex): Promise<void> {
  await knex('app_settings').where({ key: 'bot.announce_persona_change' }).del()
}
