import crypto from 'crypto'
import { db } from '../infrastructure/database/connection.js'
import { authLogger } from '../infrastructure/logger/logger.js'
import { SESSION_MAX_AGE_MS, SESSION_TOKEN_BYTES } from '../config/session.js'

/**
 * Session and user management domain service.
 *
 * Centralises DB-touching auth logic so route handlers can focus on
 * HTTP concerns (cookies, CSRF, redirects).
 */

/**
 * Create a new session for a user.
 * Generates a cryptographically random token, computes the expiry date
 * from `SESSION_MAX_AGE_MS`, and inserts the session row.
 */
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

/**
 * Look up a session by its token and return the associated user ID
 * when the session is valid (exists and not expired). Returns null otherwise.
 */
export async function getSessionUserId(token: string): Promise<string | null> {
  const session = await db('sessions')
    .where({ token })
    .where('expires_at', '>', new Date())
    .first()

  return session?.user_id ?? null
}

/**
 * Invalidate a session by deleting its row. Returns true when a row was
 * deleted, false when the token was unknown.
 */
export async function invalidateSession(token: string): Promise<boolean> {
  const deleted = await db('sessions').where({ token }).del()
  return deleted > 0
}

/**
 * Invalidate every session owned by a user. Used when the user's privileges
 * change (admin role granted/revoked, premium toggled by an admin) so that any
 * in-flight clients are forced to re-authenticate and pick up the new state.
 *
 * Returns the number of session rows that were deleted.
 */
export async function invalidateAllUserSessions(userId: string): Promise<number> {
  const deleted = await db('sessions').where({ user_id: userId }).del()
  if (deleted > 0) {
    authLogger.info({ userId, sessions: deleted }, 'all user sessions invalidated')
  }
  return deleted
}

/**
 * Find an existing user by Steam ID or create a new one using the supplied
 * Steam profile data. Also ensures the matching row in the `accounts` table
 * linking the Steam provider to the user exists.
 *
 * Returns the user record (id, steamId, displayName, avatarUrl).
 */
export async function findOrCreateSteamUser(
  steamId: string,
  profile: { displayName: string; avatarUrl: string; profileUrl?: string },
): Promise<{ id: string; steamId: string; displayName: string; avatarUrl: string }> {
  let user = await db('users').where({ steam_id: steamId }).first()

  if (user) {
    // Update existing user profile with latest Steam data
    await db('users').where({ id: user.id }).update({
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      profile_url: profile.profileUrl ?? user.profile_url,
      updated_at: db.fn.now(),
    })
  } else {
    // Create new user
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

    // Create matching account link for the Steam provider
    await db('accounts').insert({
      user_id: user.id,
      provider_id: 'steam',
      account_id: steamId,
    })

    authLogger.info({ steamId, displayName: profile.displayName }, 'new user created')
  }

  // Ensure account link exists (covers pre-migration users that were created
  // before the `accounts` table existed).
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
