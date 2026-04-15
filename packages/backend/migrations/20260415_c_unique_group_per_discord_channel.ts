import type { Knex } from 'knex'

/**
 * Enforce "at most one group per Discord channel" at the database layer.
 *
 * Two code paths now bind a group to a Discord channel:
 *   1. The bot's `/wawptn setup` flow, which upserts via `discord_auth_intents`
 *      and is intrinsically idempotent on `discord_channel_id`.
 *   2. The web app's new group creation flow, which lets the owner pick a
 *      guild/channel via Discord OAuth2 and stores the IDs directly.
 *
 * Without a DB-level constraint, two creators could race to bind the same
 * channel, and `findByDiscordChannel()` (which `SELECT ... LIMIT 1`) would
 * silently mask one of them. A partial unique index over
 * `(discord_channel_id) WHERE discord_channel_id IS NOT NULL AND archived_at IS NULL`
 * closes that window while still allowing:
 *   - unbound groups (discord_channel_id IS NULL)
 *   - archived groups to coexist with a fresh active binding to the same channel
 *
 * Index is created IF NOT EXISTS for idempotent re-runs.
 */
export async function up(knex: Knex): Promise<void> {
  // Defensive dedup: if any active rows already share a channel, keep the
  // most recently updated one bound and clear the binding on the rest.
  // These groups are not deleted — they remain usable without Discord.
  await knex.raw(`
    UPDATE groups
    SET discord_channel_id = NULL,
        discord_guild_id = NULL,
        discord_webhook_url = NULL
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY discord_channel_id
                 ORDER BY updated_at DESC, id DESC
               ) AS rn
        FROM groups
        WHERE discord_channel_id IS NOT NULL
          AND archived_at IS NULL
      ) ranked
      WHERE ranked.rn > 1
    )
  `)

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_groups_one_active_per_discord_channel
    ON groups (discord_channel_id)
    WHERE discord_channel_id IS NOT NULL AND archived_at IS NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS uniq_groups_one_active_per_discord_channel')
}
