import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import type {
  IGroupRepository,
  GroupRow,
  GroupMemberRow,
} from '../../domain/repositories/group-repository.js'

/**
 * Knex-backed implementation of `IGroupRepository`.
 *
 * The `knex` instance is injected (defaulting to the shared `db` singleton),
 * which lets callers pass a transaction (`trx`) or a test double.
 */
export class KnexGroupRepository implements IGroupRepository {
  constructor(private readonly knex: Knex = db) {}

  async findById(id: string): Promise<GroupRow | null> {
    const row = await this.knex<GroupRow>('groups').where({ id }).first()
    return row ?? null
  }

  async findByDiscordChannel(channelId: string): Promise<GroupRow | null> {
    const row = await this.knex<GroupRow>('groups')
      .where({ discord_channel_id: channelId })
      .first()
    return row ?? null
  }

  async findMembersByGroupId(groupId: string): Promise<GroupMemberRow[]> {
    return this.knex<GroupMemberRow>('group_members')
      .where({ group_id: groupId })
      .orderBy('joined_at', 'asc')
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMemberRow | null> {
    const row = await this.knex<GroupMemberRow>('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first()
    return row ?? null
  }

  async listUserGroups(userId: string): Promise<GroupRow[]> {
    return this.knex<GroupRow>('groups')
      .join('group_members', 'group_members.group_id', 'groups.id')
      .where('group_members.user_id', userId)
      .select('groups.*')
      .orderBy('groups.created_at', 'desc')
  }
}

/** Default singleton bound to the shared `db` connection. */
export const groupRepository: IGroupRepository = new KnexGroupRepository()
