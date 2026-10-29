import crypto from 'crypto'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'
import { getIO } from '../infrastructure/socket/socket.js'

const INTENT_TTL_MS = 10 * 60 * 1000
const NONCE_BYTES = 32

export interface DiscordAuthIntent {
  id: string
  nonce: string
  discordId: string
  discordUsername: string
  discordChannelId: string
  discordGuildId: string
  channelName: string | null
  expiresAt: Date
  consumedAt: Date | null
}

export async function createDiscordAuthIntent(params: {
  discordId: string
  discordUsername: string
  discordChannelId: string
  discordGuildId: string
  channelName?: string | null
}): Promise<{ nonce: string; expiresAt: Date }> {
  const nonce = crypto.randomBytes(NONCE_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS)

  await db('discord_auth_intents').insert({
    nonce,
    discord_id: params.discordId,
    discord_username: params.discordUsername,
    discord_channel_id: params.discordChannelId,
    discord_guild_id: params.discordGuildId,
    channel_name: params.channelName ?? null,
    expires_at: expiresAt,
  })

  authLogger.info(
    {
      discordId: params.discordId,
      discordChannelId: params.discordChannelId,
      discordGuildId: params.discordGuildId,
    },
    'discord auth intent created',
  )

  return { nonce, expiresAt }
}

export async function findLiveDiscordAuthIntent(
  nonce: string,
): Promise<DiscordAuthIntent | null> {
  const row = await db('discord_auth_intents')
    .where({ nonce })
    .where('expires_at', '>', new Date())
    .whereNull('consumed_at')
    .first()

  if (!row) return null

  return {
    id: row.id,
    nonce: row.nonce,
    discordId: row.discord_id,
    discordUsername: row.discord_username,
    discordChannelId: row.discord_channel_id,
    discordGuildId: row.discord_guild_id,
    channelName: row.channel_name,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }
}

export async function consumeDiscordAuthIntent(nonce: string): Promise<boolean> {
  const updated = await db('discord_auth_intents')
    .where({ nonce })
    .where('expires_at', '>', new Date())
    .whereNull('consumed_at')
    .update({ consumed_at: db.fn.now() })

  return updated > 0
}

export async function isBannedFromGroup(params: {
  groupId: string
  userId?: string | null
  discordId?: string | null
}): Promise<boolean> {
  const { groupId, userId, discordId } = params
  if (!userId && !discordId) return false

  const query = db('group_bans').where({ group_id: groupId })

  if (userId && discordId) {
    query.andWhere((q) => {
      q.where({ user_id: userId }).orWhere({ discord_id: discordId })
    })
  } else if (userId) {
    query.andWhere({ user_id: userId })
  } else if (discordId) {
    query.andWhere({ discord_id: discordId })
  }

  const ban = await query.first()
  return !!ban
}

export async function materializeGroupForIntent(
  userId: string,
  intent: Pick<
    DiscordAuthIntent,
    'discordId' | 'discordUsername' | 'discordChannelId' | 'discordGuildId' | 'channelName'
  >,
): Promise<{ groupId: string; created: boolean; alreadyMember: boolean }> {
  await db('discord_links')
    .insert({
      user_id: userId,
      discord_id: intent.discordId,
      discord_username: intent.discordUsername,
    })
    .onConflict('user_id')
    .merge({
      discord_id: intent.discordId,
      discord_username: intent.discordUsername,
    })

  let group = await db('groups')
    .where({ discord_channel_id: intent.discordChannelId })
    .whereNull('archived_at')
    .first()

  let created = false

  if (!group) {
    const [newGroup] = await db('groups')
      .insert({
        name: intent.channelName ?? `#${intent.discordChannelId}`,
        created_by: userId,
        discord_channel_id: intent.discordChannelId,
        discord_guild_id: intent.discordGuildId,
      })
      .returning('*')
    group = newGroup
    created = true

    await db('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'owner',
    })

    authLogger.info(
      { userId, groupId: group.id, discordChannelId: intent.discordChannelId },
      'group materialised from discord intent',
    )
  }

  if (!created) {
    const banned = await isBannedFromGroup({
      groupId: group.id,
      userId,
      discordId: intent.discordId,
    })
    if (banned) {
      authLogger.warn(
        { userId, groupId: group.id, discordId: intent.discordId },
        'blocked discord intent materialisation: user is banned from group',
      )
      throw new Error('banned')
    }
  }

  const existing = await db('group_members')
    .where({ group_id: group.id, user_id: userId })
    .first()

  const alreadyMember = !!existing

  if (!created && !alreadyMember) {
    await db('group_members').insert({
      group_id: group.id,
      user_id: userId,
      role: 'member',
    })

    const user = await db('users').where({ id: userId }).first()
    if (user) {
      try {
        getIO().to(`group:${group.id}`).emit('member:joined', {
          groupId: group.id,
          user: {
            id: user.id,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
          },
        })
      } catch (err) {
        authLogger.debug({ error: String(err) }, 'socket emit skipped')
      }
    }
  }

  return { groupId: group.id, created, alreadyMember }
}
