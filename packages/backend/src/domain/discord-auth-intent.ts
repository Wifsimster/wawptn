import crypto from 'crypto'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'
import { getIO } from '../infrastructure/socket/socket.js'

/**
 * Discord auth-intent domain service.
 *
 * Supports the "magic link" flow used by the Discord bot:
 *   1. Bot issues `/wawptn setup` (or any command that needs a linked
 *      WAWPTN session). `createDiscordAuthIntent` persists a short-lived,
 *      one-shot nonce and returns the URL to surface in the bot's reply.
 *   2. User opens the URL, which hits `GET /api/auth/discord/intent/:nonce`
 *      and bounces them through Steam OpenID.
 *   3. The Steam callback consumes the intent via `consumeDiscordAuthIntent`
 *      then materialises the group membership (`materializeGroupForIntent`).
 *
 * Ban enforcement (decision D16) happens in `materializeGroupForIntent`
 * — not at intent creation — because the ban may target the Discord
 * identity before any WAWPTN user exists for them.
 */

const INTENT_TTL_MS = 10 * 60 * 1000 // 10 minutes
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

/**
 * Persist a new intent and return the nonce. The caller is responsible
 * for turning the nonce into a user-facing URL (typically
 * `${API_URL}/api/auth/discord/intent/${nonce}`).
 */
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

/**
 * Look up an intent by nonce. Returns null if the nonce is unknown,
 * expired, or already consumed. Does NOT mutate state — callers should
 * follow this with `consumeDiscordAuthIntent` once the user's identity
 * is confirmed.
 */
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

/**
 * Atomically mark an intent as consumed. Returns true if the caller is
 * the one that won the race (i.e. the row transitioned from not-consumed
 * to consumed in this call). Any subsequent call with the same nonce
 * returns false — this is the one-shot guarantee.
 */
export async function consumeDiscordAuthIntent(nonce: string): Promise<boolean> {
  const updated = await db('discord_auth_intents')
    .where({ nonce })
    .where('expires_at', '>', new Date())
    .whereNull('consumed_at')
    .update({ consumed_at: db.fn.now() })

  return updated > 0
}

/**
 * Check whether a given (group, user/discord) pair is banned. Used by
 * both the invite-token join path and the magic-link materialisation
 * path to honour decision D16 (kick implies ban, not just removal).
 *
 * Returns true when a matching `group_bans` row exists.
 */
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

/**
 * Materialise a WAWPTN group and membership from a consumed Discord
 * auth intent. This is the core of the "channel = group" flow:
 *
 *   1. Upsert `discord_links (user_id, discord_id)` so the caller's
 *      WAWPTN identity is linked to their Discord identity.
 *   2. Look up an existing active group for the channel. If none
 *      exists, create one with the caller as owner.
 *   3. Run the ban check; if the caller is banned, abort.
 *   4. Insert a `group_members` row (no-op on conflict). Emit
 *      `member:joined` so connected clients see the new member in
 *      real time, matching the invite-token join path.
 *
 * Returns the resolved group ID and whether this call created the group.
 * Throws `new Error('banned')` if the caller is on the group's ban list
 * so the HTTP layer can render a clear 403.
 */
export async function materializeGroupForIntent(
  userId: string,
  intent: Pick<
    DiscordAuthIntent,
    'discordId' | 'discordUsername' | 'discordChannelId' | 'discordGuildId' | 'channelName'
  >,
): Promise<{ groupId: string; created: boolean; alreadyMember: boolean }> {
  // 1. Upsert the Discord identity link for this user. Uses the
  //    (user_id) PK on `discord_links`; `discord_id` is additionally
  //    unique so a single user can only ever hold one Discord identity.
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

  // 2. Find or create the group for this channel. We key on
  //    `discord_channel_id` and ignore archived rows so a reconnected
  //    channel starts fresh rather than resurrecting stale state.
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

    // The creator is the owner. Insert immediately so we never have a
    // group without an owner row — the /join path checks for owner
    // presence when computing member-limit tiers.
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

  // 3. Ban check. Owners can't be banned from their own group (we just
  //    created them as owner above), so only run this on the non-created
  //    path where the caller is a prospective member.
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

  // 4. Insert membership row. `onConflict` makes this a no-op if the
  //    user is already a member (returning users re-entering via the
  //    magic link should not double-insert).
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

    // Mirror the invite-token join path: broadcast member:joined so
    // the group page updates live for other connected clients.
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
        // Socket.io may not be initialised during tests; swallow.
        authLogger.debug({ error: String(err) }, 'socket emit skipped')
      }
    }
  }

  return { groupId: group.id, created, alreadyMember }
}
