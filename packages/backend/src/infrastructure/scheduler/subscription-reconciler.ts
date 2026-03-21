import cron from 'node-cron'
import { db } from '../database/connection.js'
import { getStripe, isStripeEnabled } from '../stripe/stripe-client.js'
import { logger } from '../logger/logger.js'

const reconcilerLogger = logger.child({ module: 'subscription-reconciler' })

/** Grace period in days before downgrading past_due subscriptions */
const GRACE_PERIOD_DAYS = 3

/**
 * Start daily cron job to reconcile subscription state with Stripe.
 * Handles:
 * - Syncing subscription status from Stripe
 * - Downgrading past_due subscriptions after grace period
 * - Cleaning up expired subscriptions
 */
export function startSubscriptionReconciler(): void {
  if (!isStripeEnabled()) return

  // Run daily at 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    reconcilerLogger.info('starting subscription reconciliation')
    try {
      await reconcileSubscriptions()
      await enforcePastDueGracePeriod()
      reconcilerLogger.info('subscription reconciliation completed')
    } catch (error) {
      reconcilerLogger.error({ error: String(error) }, 'subscription reconciliation failed')
    }
  })

  reconcilerLogger.info('subscription reconciler scheduled (daily at 03:00 UTC)')
}

/**
 * Reconcile active subscriptions with Stripe to fix any drift.
 */
async function reconcileSubscriptions(): Promise<void> {
  const stripe = getStripe()

  const activeSubscriptions = await db('subscriptions')
    .whereNotNull('stripe_subscription_id')
    .whereIn('status', ['active', 'past_due'])
    .select('id', 'stripe_subscription_id', 'tier', 'status')

  let synced = 0
  let errors = 0

  for (const sub of activeSubscriptions) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      const stripeStatus = stripeSub.cancel_at_period_end ? 'canceled' : stripeSub.status === 'active' ? 'active' : 'past_due'
      const stripeTier = stripeSub.status === 'active' ? 'premium' : 'free'
      const periodEnd = stripeSub.items.data[0]
        ? new Date(stripeSub.items.data[0].current_period_end * 1000)
        : null

      // Only update if state has drifted
      if (sub.status !== stripeStatus || sub.tier !== stripeTier) {
        await db('subscriptions')
          .where({ id: sub.id })
          .update({
            tier: stripeTier,
            status: stripeStatus,
            current_period_end: periodEnd,
            updated_at: db.fn.now(),
          })

        reconcilerLogger.info(
          { subscriptionId: sub.stripe_subscription_id, oldStatus: sub.status, newStatus: stripeStatus },
          'subscription state reconciled'
        )
      }

      synced++
    } catch (error) {
      errors++
      reconcilerLogger.warn(
        { error: String(error), subscriptionId: sub.stripe_subscription_id },
        'failed to reconcile subscription'
      )
    }
  }

  reconcilerLogger.info({ synced, errors, total: activeSubscriptions.length }, 'reconciliation pass complete')
}

/**
 * Downgrade past_due subscriptions after grace period expires.
 */
async function enforcePastDueGracePeriod(): Promise<void> {
  const graceDeadline = new Date()
  graceDeadline.setDate(graceDeadline.getDate() - GRACE_PERIOD_DAYS)

  const expired = await db('subscriptions')
    .where({ status: 'past_due' })
    .where('updated_at', '<', graceDeadline)
    .update({
      tier: 'free',
      status: 'canceled',
      updated_at: db.fn.now(),
    })

  if (expired > 0) {
    reconcilerLogger.info({ count: expired }, 'past_due subscriptions downgraded after grace period')
  }
}
