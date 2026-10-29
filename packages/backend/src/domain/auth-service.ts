import crypto from 'crypto'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'
import { SESSION_MAX_AGE_MS, SESSION_TOKEN_BYTES } from '../config/session.js'

export async function createUserSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS)

  await db('sessions').insert({
    user_id: userId,
    token,
    expires_at: expiresAt,
  })

  return { token, expiresAt }
}

export async function getSessionUserId(token: string): Promise<string | null> {
  const session = await db('sessions')
    .where({ token })
    .where('expires_at', '>', new Date())
    .first()

  return session?.user_id ?? null
}

export async function invalidateSession(token: string): Promise<boolean> {
  const deleted = await db('sessions').where({ token }).del()
  return deleted > 0
}

export async function invalidateAllUserSessions(userId: string): Promise<number> {
  const deleted = await db('sessions').where({ user_id: userId }).del()
  if (deleted > 0) {
    authLogger.info({ userId, sessions: deleted }, 'all user sessions invalidated')
  }
  return deleted
}

export async function findOrCreateSteamUser(
  steamId: string,
  profile: { displayName: string; avatarUrl: string; profileUrl?: string },
): Promise<{ id: string; steamId: string; displayName: string; avatarUrl: string }> {
  let user = await db('users').where({ steam_id: steamId }).first()

  if (user) {
    await db('users').where({ id: user.id }).update({
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      profile_url: profile.profileUrl ?? user.profile_url,
      updated_at: db.fn.now(),
    })
  } else {
    const [newUser] = await db('users').insert({
      steam_id: steamId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      profile_url: profile.profileUrl ?? null,
      email: `${steamId}@steam.wawptn.app`,
      email_verified: false,
      library_visible: true,
    }).returning('*')
    user = newUser

    await db('accounts').insert({
      user_id: user.id,
      provider_id: 'steam',
      account_id: steamId,
    })

    authLogger.info({ steamId, displayName: profile.displayName }, 'new user created')
  }

  const existingAccount = await db('accounts')
    .where({ user_id: user.id, provider_id: 'steam' })
    .first()
  if (!existingAccount) {
    await db('accounts').insert({
      user_id: user.id,
      provider_id: 'steam',
      account_id: steamId,
    })
  }

  return {
    id: user.id,
    steamId: user.steam_id,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
  }
}
