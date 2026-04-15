import type { Knex } from 'knex'

/**
 * Per-group daily persona settings.
 *
 * Before this migration the "persona du jour" was a global singleton: one
 * persona was hashed from the Paris date and shown to every group, every
 * channel, everywhere. This table moves persona selection to a per-group
 * concern — each group can now have its own rotation, its own disabled
 * list, and its own override. The global `bot.*` rows in `app_settings`
 * remain as a fallback layer so existing groups keep working with zero
 * backfill (missing rows = use global defaults).
 *
 * The table is 1:1 with `groups` (group_id is primary key) and rows are
 * created lazily on first write. The shared `personas` pool stays global.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_persona_settings', (table) => {
    table
      .uuid('group_id')
      .primary()
      .references('id')
      .inTable('groups')
      .onDelete('CASCADE')
    // When null, the group inherits bot.persona_rotation_enabled.
    table.boolean('rotation_enabled').nullable()
    // Persona ids excluded from the group's rotation. Merged with the
    // global bot.disabled_personas list at read time.
    table
      .specificType('disabled_personas', 'text[]')
      .notNullable()
      .defaultTo('{}')
    // Hard override: when set and not expired, the group always uses this
    // persona regardless of the daily hash. Null = no override.
    table.string('persona_override', 50).nullable()
    table.timestamp('override_expires_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_persona_settings')
}
