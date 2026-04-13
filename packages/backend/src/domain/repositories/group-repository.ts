/**
 * Group repository interface — abstracts group and membership persistence
 * so domain/application code does not depend directly on Knex/Postgres.
 *
 * Concrete implementations live under `src/infrastructure/repositories/`.
 */

export interface GroupRow {
  id: string
  name: string
  created_by: string
  invite_token_hash: string | null
  invite_expires_at: Date | null
  invite_max_uses: number | null
  invite_use_count: number | null
  common_game_threshold: number | null
  discord_channel_id: string | null
  discord_guild_id: string | null
  created_at: Date
  updated_at: Date
}

export interface GroupMemberRow {
  group_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: Date
}

export interface IGroupRepository {
  /** Find a single group by its UUID. Returns `null` when not found. */
  findById(id: string): Promise<GroupRow | null>

  /** Find a group linked to a given Discord channel. Returns `null` when not found. */
  findByDiscordChannel(channelId: string): Promise<GroupRow | null>

  /** List all memberships for a group, ordered by `joined_at` ascending. */
  findMembersByGroupId(groupId: string): Promise<GroupMemberRow[]>

  /** Look up a specific (group, user) membership row. Returns `null` when absent. */
  findMembership(groupId: string, userId: string): Promise<GroupMemberRow | null>

  /** List every group the given user is a member of, newest first. */
  listUserGroups(userId: string): Promise<GroupRow[]>
}
