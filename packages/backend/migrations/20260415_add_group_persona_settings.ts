import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_persona_settings', (table) => {
    table
      .uuid('group_id')
      .primary()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
    table.boolean('rotation_enabled').nullable()
    table
      .specificType('disabled_personas', 'text[]')
      .notNullable()
      .defaultTo('{}')
    table.string('persona_override', 50).nullable()
    table.timestamp('override_expires_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_persona_settings')
}
