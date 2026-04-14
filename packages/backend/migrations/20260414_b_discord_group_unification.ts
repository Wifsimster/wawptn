import type { Knex } from 'knex'

/**
 * Discord ↔ group unification foundation.
 *
 * Schema primitives required by the "Le salon Discord EST le groupe" feature
 * (decisions C1–C4 + D13/D16 from the 2026-04-14 design meeting):
 *
 *  1. `groups.archived_at` — soft-archive column for groups whose bound
 *     Discord channel/guild disappears (bot kicked, channel deleted).
 *     Legacy Steam-only groups can also be archived via this column.
 *
 *  2. `group_bans` — persistent blocklist preventing a kicked member from
 *     being re-materialized by the implicit enrollment path. Dual-key on
 *     both `user_id` and `discord_id` so that a ban survives users who
 *     haven't yet linked a Steam account to their Discord identity.
 *
 *  3. `discord_auth_intents` — short-lived one-shot nonces issued by the
 *     Discord bot when a user runs `/wawptn setup` (or any command that
 *     leads the user to the web app). The nonce is consumed by the Steam
 *     OpenID callback to atomically:
 *       - upsert the `discord_links` row,
 *       - upsert the `groups` row for the channel,
 *       - insert a `group_members` row (subject to `group_bans` check).
 *
 * Intentionally minimal. See the design meeting compte-rendu for the full
 * rationale; no additional columns added speculatively.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Soft-archive column on groups.
  await knex.schema.alterTable('groups', (table) => {
    table.timestamp('archived_at').nullable()
    table.index('archived_at')
  })

  // 2. Persistent ban list. At least one of `user_id` / `discord_id` must
  //    be set — enforced at the application layer since partial unique
  //    constraints with OR conditions don't translate cleanly across
  //    Postgres and the Knex schema builder.
  await knex.schema.createTable('group_bans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE')
    // WAWPTN user (nullable: ban may precede account materialisation).
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE')
    // Discord identity (nullable: ban may target a web-only user).
    table.string('discord_id').nullable()
    // Who issued the ban (group owner or system for automated enforcement).
    table.uuid('banned_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.text('reason').nullable()
    table.timestamp('banned_at').notNullable().defaultTo(knex.fn.now())

    table.index(['group_id', 'user_id'])
    table.index(['group_id', 'discord_id'])
  })

  // Unique constraints scoped to (group_id, user_id) and (group_id, discord_id)
  // where the respective column is not null. Prevents duplicate ban rows
  // without forbidding the dual-null-unset case (which the app layer rejects).
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

  // 3. Short-lived auth intents. Consumed once; rows with a non-null
  //    `consumed_at` are kept briefly for audit then swept.
  await knex.schema.createTable('discord_auth_intents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Opaque nonce embedded in the magic link. Unique + indexed so the
    // lookup in the Steam callback is a single index hit.
    table.string('nonce', 64).notNullable().unique()
    // Discord identity that triggered the intent.
    table.string('discord_id').notNullable()
    table.string('discord_username').notNullable()
    // Target Discord channel/guild the user will be enrolled into on
    // successful Steam auth. Both required — the bot always has them.
    table.string('discord_channel_id').notNullable()
    table.string('discord_guild_id').notNullable()
    // Human-readable channel name captured at intent time for display in
    // the "Vous avez rejoint #salon" toast without a Discord API round-trip.
    table.string('channel_name').nullable()
    // TTL and one-shot guard.
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
