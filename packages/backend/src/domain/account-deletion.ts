import { db } from '../infrastructure/database/connection.js'
import { logger } from '../infrastructure/logger/logger.js'
import {
  getStripe,
  isStripeEnabled,
  isStripeError,
  stripeErrorContext,
} from '../infrastructure/stripe/stripe-client.js'

const accountLogger = logger.child({ module: 'account-deletion' })

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

export async function deleteUserAccount(userId: string): Promise<void> {
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
        await trx('groups').where({ id: groupId }).del()
        continue
      }

      if (group.created_by === userId) {
        await trx('groups').where({ id: groupId }).update({ created_by: heir.user_id })
      }

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
