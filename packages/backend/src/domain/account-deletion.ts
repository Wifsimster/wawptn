import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import {
  getStripe,
  isStripeEnabled,
  isStripeError,
  stripeErrorContext,
} from '../infrastructure/stripe/stripe-client.js'

const accountLogger = logger.child({ module: 'account-deletion' })

/**
 * Gather every piece of data WAWPTN holds about a user, for the RGPD
 * data-portability right. Returns the caller's own data only.
 */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [profile, memberships, games, votes, subscription, discord] = await Promise.all([
    db('users').where({ id: userId }).first(),
    db('group_members as gm')
      .join('groups as g', 'g.id', 'gm.group_id')
      .where('gm.user_id', userId)
      .select('g.id as groupId', 'g.name as groupName', 'gm.role', 'gm.joined_at as joinedAt'),
    db('user_games').where({ user_id: userId }),
    db('votes').where({ user_id: userId }),
    db('subscriptions').where({ user_id: userId }).first(),
    db('discord_links').where({ user_id: userId }).first(),
  ])

  return {
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    groups: memberships,
    games,
    votes,
    subscription: subscription ?? null,
    discord: discord ?? null,
  }
}

/**
 * Permanently delete a user account (RGPD right to erasure).
 *
 * `groups.created_by` has ON DELETE CASCADE, so a group the user created
 * would be destroyed — taking its other members with it — the moment the
 * user row is deleted. Every group the user created or owns is therefore
 * handed to the longest-standing remaining member first; a group where
 * the user is the only member is deleted outright.
 *
 * The user row is deleted last. All remaining foreign keys to `users` are
 * ON DELETE CASCADE or SET NULL (audited 2026-05-16), so memberships,
 * votes, library, sessions, subscription, etc. are cleaned up by cascade.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  // Cancel any live Stripe subscription first, outside the DB transaction,
  // so billing stops even though the local row is about to be deleted.
  // Best-effort — a Stripe outage must not block the right to erasure.
  if (isStripeEnabled()) {
    try {
      const sub = await db('subscriptions')
        .where({ user_id: userId })
        .whereNotNull('stripe_subscription_id')
        .first()
      if (sub?.stripe_subscription_id && sub.status !== 'canceled') {
        await getStripe().subscriptions.cancel(sub.stripe_subscription_id)
        accountLogger.info({ userId }, 'cancelled Stripe subscription for account deletion')
      }
    } catch (err) {
      accountLogger.error(
        isStripeError(err) ? stripeErrorContext(err) : { error: String(err), userId },
        'failed to cancel Stripe subscription on account deletion — continuing',
      )
    }
  }

  await db.transaction(async (trx) => {
    const createdGroupIds: string[] = await trx('groups').where({ created_by: userId }).pluck('id')
    const ownedGroupIds: string[] = await trx('group_members')
      .where({ user_id: userId, role: 'owner' })
      .pluck('group_id')
    const groupIds = [...new Set([...createdGroupIds, ...ownedGroupIds])]

    for (const groupId of groupIds) {
      const group = await trx('groups').where({ id: groupId }).first('id', 'created_by')
      if (!group) continue

      const heir = await trx('group_members')
        .where({ group_id: groupId })
        .andWhereNot({ user_id: userId })
        .orderBy('joined_at', 'asc')
        .first('user_id')

      if (!heir) {
        // The user is the only member — the group leaves with the account.
        await trx('groups').where({ id: groupId }).del()
        continue
      }

      // Reassign created_by so the cascade does not destroy the group.
      if (group.created_by === userId) {
        await trx('groups').where({ id: groupId }).update({ created_by: heir.user_id })
      }

      // Hand current ownership to the heir if the departing user is the owner.
      const userIsOwner = await trx('group_members')
        .where({ group_id: groupId, user_id: userId, role: 'owner' })
        .first()
      if (userIsOwner) {
        await trx('group_members')
          .where({ group_id: groupId, user_id: heir.user_id })
          .update({ role: 'owner' })
      }
    }

    await trx('users').where({ id: userId }).del()
  })

  accountLogger.info({ userId }, 'user account deleted')
}
