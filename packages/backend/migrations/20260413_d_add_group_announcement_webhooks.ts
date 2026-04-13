import type { Knex } from 'knex'

/**
 * Group announcement webhooks: lets a group broadcast vote results to
 * more channels than the single `discord_webhook_url` column allows.
 *
 * The primary `discord_webhook_url` on the groups table stays where it is
 * (it's still the "main" channel wired by /wawptn-setup). This new table
 * holds *extra* announcement webhooks — typically a #general or
 * #announcements channel in the same guild where the group owner wants
 * results echoed for visibility.
 *
 * Implements Tom #4 from the multi-persona feature meeting.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('group_announcement_webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Parent group. CASCADE on delete so removing the group takes its
    // announcement webhooks with it — no dangling rows.
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    // The Discord webhook URL to POST to. Kept encrypted-at-rest by the
    // DB at the storage layer; the URL itself is a secret and should not
    // be returned to non-owner API consumers.
    table.text('webhook_url').notNullable()
    // Free-form label so owners can remember which channel this webhook
    // points at ("#general", "#gamer-friends") without leaking the URL.
    table.string('label', 64).nullable()
    // Audit columns
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.index('group_id')
    // A single channel should never be registered twice on the same
    // group — it would just spam the channel on every vote close.
    table.unique(['group_id', 'webhook_url'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('group_announcement_webhooks')
}
