import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
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
