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
  findById(id: string): Promise<GroupRow | null>

  findByDiscordChannel(channelId: string): Promise<GroupRow | null>

  findMembersByGroupId(groupId: string): Promise<GroupMemberRow[]>

  findMembership(groupId: string, userId: string): Promise<GroupMemberRow | null>

  listUserGroups(userId: string): Promise<GroupRow[]>
}
