import cron from 'node-cron'
import type Stripe from 'stripe'
import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import { getStripe, isStripeEnabled } from '../stripe/stripe-client.js'
import { logger } from '../logger/logger.js'
import { invalidatePremiumCache, PAST_DUE_GRACE_PERIOD_DAYS } from '../../domain/subscription-service.js'
import { mapStripeStatus } from '../../domain/stripe-event-handlers.js'
import { recordSystemAction } from '../../domain/admin-audit-log.js'

const reconcilerLogger = logger.child({ module: 'subscription-reconciler' })

const GRACE_PERIOD_DAYS = PAST_DUE_GRACE_PERIOD_DAYS

const RECONCILER_LOCK_KEY = 0x5741575054_4e525043n

let isRunning = false

let shuttingDown = false

let currentRun: Promise<unknown> | null = null

export interface ReconcilerHealth {
  lastRunAt: Date | null
  lastRunSucceeded: boolean | null
  lastRunDurationMs: number | null
  lastRunSynced: number
  lastRunErrors: number
  lastRunDrifts: number
  lastRunRepaired: number
  lastRunDowngraded: number
}

const health: ReconcilerHealth = {
  lastRunAt: null,
  lastRunSucceeded: null,
  lastRunDurationMs: null,
  lastRunSynced: 0,
  lastRunErrors: 0,
  lastRunDrifts: 0,
  lastRunRepaired: 0,
  lastRunDowngraded: 0,
}

export function getReconcilerHealth(): ReconcilerHealth {
  return { ...health }
}

export function startSubscriptionReconciler(): void {
  if (!isStripeEnabled()) return

  cron.schedule('0 3 * * *', async () => {
    await runReconciliation()
  })

  setTimeout(() => { void runReconciliation() }, 30_000)

  reconcilerLogger.info('subscription reconciler scheduled (daily at 03:00 UTC, catch-up on startup)')
}

export async function stopSubscriptionReconciler(): Promise<void> {
  shuttingDown = true
  if (currentRun) {
    try {
      await currentRun
    } catch {
    }
  }
}

export async function runReconciliation(): Promise<ReconcilerHealth> {
  if (isRunning) {
    reconcilerLogger.warn('reconciliation already in flight on this instance — skipping')
    return getReconcilerHealth()
  }
  isRunning = true
  const start = Date.now()
  const passPromise = (async () => {
    let lockTrx: Knex.Transaction | null = null
    try {
      lockTrx = await db.transaction()
      const lockResult = await lockTrx.raw<{ rows: Array<{ got: boolean }> }>(
        'SELECT pg_try_advisory_xact_lock(?) AS got',
        [RECONCILER_LOCK_KEY.toString()],
      )
      const got = !!lockResult.rows?.[0]?.got
      if (!got) {
        reconcilerLogger.info('reconciliation lock held by another instance — skipping')
        await lockTrx.commit()
        lockTrx = null
        return getReconcilerHealth()
      }

      reconcilerLogger.info('starting subscription reconciliation')

      health.lastRunAt = new Date()
      health.lastRunSucceeded = null
      health.lastRunSynced = 0
      health.lastRunErrors = 0
      health.lastRunDrifts = 0
      health.lastRunRepaired = 0
      health.lastRunDowngraded = 0

      try {
        await reconcileSubscriptions()
        if (!shuttingDown) await repairOrphanCustomers()
        if (!shuttingDown) {
          health.lastRunDowngraded = await enforcePastDueGracePeriod()
        }
        health.lastRunSucceeded = true
      } catch (error) {
        health.lastRunSucceeded = false
        reconcilerLogger.error({ error: String(error) }, 'subscription reconciliation failed')
      }

      health.lastRunDurationMs = Date.now() - start

      const total = health.lastRunSynced + health.lastRunErrors
      const errorRate = total > 0 ? health.lastRunErrors / total : 0
      if (errorRate > 0.5 && health.lastRunErrors > 0) {
        reconcilerLogger.error(
          { synced: health.lastRunSynced, errors: health.lastRunErrors, errorRate },
          'reconciler error rate above 50%',
        )
      } else {
        reconcilerLogger.info(
          {
            synced: health.lastRunSynced,
            errors: health.lastRunErrors,
            drifts: health.lastRunDrifts,
            repaired: health.lastRunRepaired,
            downgraded: health.lastRunDowngraded,
            downgradedDuringShutdown: shuttingDown,
            durationMs: health.lastRunDurationMs,
          },
          'reconciliation pass complete',
        )
      }

      await lockTrx.commit()
      lockTrx = null
      return getReconcilerHealth()
    } catch (error) {
      reconcilerLogger.error({ error: String(error) }, 'reconciliation outer failure')
      if (lockTrx) {
        try { await lockTrx.rollback() } catch { }
      }
      health.lastRunSucceeded = false
      health.lastRunDurationMs = Date.now() - start
      return getReconcilerHealth()
    }
  })()
  currentRun = passPromise
  try {
    return await passPromise
  } finally {
    isRunning = false
    currentRun = null
  }
}


async function reconcileSubscriptions(): Promise<void> {
  const stripe = getStripe()

  const localRows = await db('subscriptions')
    .whereNotNull('stripe_subscription_id')
    .select('user_id', 'stripe_subscription_id', 'tier', 'status', 'cancel_at_period_end', 'past_due_since')
  const byStripeId = new Map<string, typeof localRows[number]>()
  for (const row of localRows) byStripeId.set(row.stripe_subscription_id, row)

  for await (const stripeSub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    if (shuttingDown) {
      reconcilerLogger.warn('shutdown signaled — aborting reconcileSubscriptions mid-pass')
      return
    }
    const local = byStripeId.get(stripeSub.id)

    const { tier: stripeTier, status: stripeStatus, cancelAtPeriodEnd } = mapStripeStatus(stripeSub)

    try {
      if (!local) {
        const userId = stripeSub.metadata?.['userId']
        const recoverable = typeof userId === 'string' && userId.length > 0
          && await isRecoverableOrphanSub(userId, stripeSub)
        if (recoverable) {
          const customer = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id
          const periodEnd = stripeSub.items.data[0]
            ? new Date(stripeSub.items.data[0].current_period_end * 1000)
            : null
          const price = stripeSub.items.data[0]?.price
          await db('subscriptions')
            .insert({
              user_id: userId,
              stripe_customer_id: customer,
              stripe_subscription_id: stripeSub.id,
              tier: stripeTier,
              status: stripeStatus,
              cancel_at_period_end: cancelAtPeriodEnd,
              current_period_end: periodEnd,
              past_due_since: null,
              price_id: price?.id ?? null,
              amount_cents: typeof price?.unit_amount === 'number' ? price.unit_amount : null,
              currency: typeof price?.currency === 'string' ? price.currency : null,
            })
            .onConflict('user_id')
            .merge()
          invalidatePremiumCache(userId)
          await recordSystemAction('subscription.system.reconciled', userId, {
            stripeSubscriptionId: stripeSub.id,
            reason: 'orphan_stripe_sub_recovered',
          })
          health.lastRunRepaired++
        }
        health.lastRunSynced++
        continue
      }

      const driftedTier = local.tier !== stripeTier
      const driftedStatus = local.status !== stripeStatus
      const driftedCancel = !!local.cancel_at_period_end !== cancelAtPeriodEnd

      if (driftedTier || driftedStatus || driftedCancel) {
        const periodEnd = stripeSub.items.data[0]
          ? new Date(stripeSub.items.data[0].current_period_end * 1000)
          : null
        const price = stripeSub.items.data[0]?.price
        const update: Record<string, unknown> = {
          tier: stripeTier,
          status: stripeStatus,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: periodEnd,
          updated_at: db.fn.now(),
        }
        if (stripeStatus === 'past_due') {
          if (local.status === 'active') update['past_due_since'] = new Date()
        } else {
          update['past_due_since'] = null
        }
        if (price?.id) {
          update['price_id'] = price.id
          update['amount_cents'] = typeof price.unit_amount === 'number' ? price.unit_amount : null
          update['currency'] = typeof price.currency === 'string' ? price.currency : null
        }

        await db('subscriptions')
          .where({ user_id: local.user_id })
          .update(update)

        invalidatePremiumCache(local.user_id)
        await recordSystemAction('subscription.system.reconciled', local.user_id, {
          stripeSubscriptionId: stripeSub.id,
          oldStatus: local.status,
          newStatus: stripeStatus,
          oldTier: local.tier,
          newTier: stripeTier,
        })

        reconcilerLogger.info(
          { userId: local.user_id, stripeSubscriptionId: stripeSub.id, oldStatus: local.status, newStatus: stripeStatus },
          'subscription state reconciled',
        )
        health.lastRunDrifts++
      }
      health.lastRunSynced++
    } catch (error) {
      health.lastRunErrors++
      reconcilerLogger.warn(
        { error: String(error), stripeSubscriptionId: stripeSub.id },
        'failed to reconcile subscription',
      )
    }
  }
}

async function isRecoverableOrphanSub(userId: string, stripeSub: Stripe.Subscription): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return false
  const user = await db('users').where({ id: userId }).select('id').first()
  if (!user) return false

  const row = await db('subscriptions')
    .where({ user_id: userId })
    .select('stripe_subscription_id', 'status')
    .first()
  if (!row || !row.stripe_subscription_id) return true

  const live = stripeSub.status === 'active' || stripeSub.status === 'trialing'
  return live && row.status !== 'active'
}

async function repairOrphanCustomers(): Promise<void> {
  const stripe = getStripe()

  const orphans = await db('subscriptions')
    .whereNotNull('stripe_customer_id')
    .whereNull('stripe_subscription_id')
    .select('user_id', 'stripe_customer_id')

  for (const row of orphans) {
    if (shuttingDown) {
      reconcilerLogger.warn('shutdown signaled — aborting repairOrphanCustomers mid-pass')
      return
    }
    try {
      const result = await stripe.subscriptions.list({
        customer: row.stripe_customer_id,
        status: 'all',
        limit: 5,
      })

      const live = (result.data as Stripe.Subscription[]).find(
        (s) => s.status === 'active' || s.status === 'trialing',
      )
      if (!live) continue

      const periodEnd = live.items.data[0]
        ? new Date(live.items.data[0].current_period_end * 1000)
        : null

      await db('subscriptions')
        .where({ user_id: row.user_id })
        .update({
          stripe_subscription_id: live.id,
          tier: 'premium',
          status: 'active',
          cancel_at_period_end: !!live.cancel_at_period_end,
          current_period_end: periodEnd,
          updated_at: db.fn.now(),
        })

      invalidatePremiumCache(row.user_id)
      await recordSystemAction('subscription.system.reconciled', row.user_id, {
        stripeSubscriptionId: live.id,
        reason: 'orphan_customer_recovered',
      })
      health.lastRunRepaired++
      reconcilerLogger.info(
        { userId: row.user_id, stripeSubscriptionId: live.id },
        'orphan customer repaired — premium granted',
      )
    } catch (error) {
      health.lastRunErrors++
      reconcilerLogger.warn(
        { error: String(error), customerId: row.stripe_customer_id },
        'failed to repair orphan customer',
      )
    }
  }
}

async function enforcePastDueGracePeriod(): Promise<number> {
  const graceDeadline = new Date()
  graceDeadline.setDate(graceDeadline.getDate() - GRACE_PERIOD_DAYS)

  const expired = await db('subscriptions')
    .where({ status: 'past_due' })
    .whereNotNull('past_due_since')
    .where('past_due_since', '<', graceDeadline)
    .select('user_id')

  for (const row of expired) {
    await db('subscriptions')
      .where({ user_id: row.user_id })
      .update({
        tier: 'free',
        status: 'canceled',
        past_due_since: null,
        updated_at: db.fn.now(),
      })
    invalidatePremiumCache(row.user_id)
    await recordSystemAction('subscription.system.canceled', row.user_id, {
      reason: 'past_due_grace_expired',
    })
  }

  if (expired.length > 0) {
    reconcilerLogger.info({ count: expired.length }, 'past_due subscriptions downgraded after grace period')
  }
  return expired.length
}
