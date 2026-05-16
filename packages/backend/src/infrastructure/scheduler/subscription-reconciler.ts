import cron from 'node-cron'
import type Stripe from 'stripe'
import type { Knex } from 'knex'
import { db } from '../database/connection.js'
import { getStripe, isStripeEnabled } from '../stripe/stripe-client.js'
import { logger } from '../logger/logger.js'
import { invalidatePremiumCache } from '../../domain/subscription-service.js'
import { recordSystemAction } from '../../domain/admin-audit-log.js'

const reconcilerLogger = logger.child({ module: 'subscription-reconciler' })

/** Grace period in days before downgrading past_due subscriptions */
const GRACE_PERIOD_DAYS = 3

/** Postgres advisory-lock key — only one replica may hold this at a time, so
 *  the daily reconcile fires once across the fleet instead of N times. The
 *  literal value is arbitrary but must be stable; pick a fixed bigint. */
const RECONCILER_LOCK_KEY = 0x5741575054_4e525043n // 'WAWPTNRPC'

/** Same-instance overlap guard: a manual /admin trigger that lands while the
 *  cron is mid-run would otherwise queue up duplicate work. */
let isRunning = false

/** SIGTERM coordination — the inner pass polls this flag between Stripe
 *  pages so a graceful shutdown can stop without aborting an in-flight
 *  Stripe call. */
let shuttingDown = false

/** Promise of the in-flight pass, exposed so the process shutdown handler
 *  can await it before closing the DB connection. */
let currentRun: Promise<unknown> | null = null

/** In-memory snapshot of the last reconcile pass — surfaced by the
 *  /admin/subscription-health endpoint so ops can see whether the daily
 *  job is healthy without grepping logs. */
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

/**
 * Start daily cron job to reconcile subscription state with Stripe.
 *
 * Cross-replica election is enforced via a Postgres advisory lock acquired
 * inside `runReconciliation` — every replica's cron fires, but only the one
 * that wins the lock proceeds. The rest log and exit, so we don't hammer
 * Stripe N times per day on a multi-replica deploy.
 */
export function startSubscriptionReconciler(): void {
  if (!isStripeEnabled()) return

  cron.schedule('0 3 * * *', async () => {
    await runReconciliation()
  })

  // Catch-up: in-process cron does not replay a fire time missed while the
  // process was down, so a deploy or crash spanning 03:00 UTC would skip a
  // day of reconciliation. Run once shortly after startup to cover that.
  // The pass is idempotent and advisory-locked, so an extra run per deploy
  // is harmless.
  setTimeout(() => { void runReconciliation() }, 30_000)

  reconcilerLogger.info('subscription reconciler scheduled (daily at 03:00 UTC, catch-up on startup)')
}

/** Signal the reconciler that the process is shutting down and wait for any
 *  in-flight pass to settle. Called from the SIGTERM/SIGINT handler so an
 *  active Stripe pagination loop has a chance to stop cleanly between pages
 *  before the DB connection is closed. */
export async function stopSubscriptionReconciler(): Promise<void> {
  shuttingDown = true
  if (currentRun) {
    try {
      await currentRun
    } catch {
      // Errors are already logged inside runReconciliation.
    }
  }
}

/** Single pass — exposed for testability and for an /admin endpoint that
 *  manually triggers reconciliation if the daily job has been failing.
 *
 *  Concurrency model:
 *    1. `isRunning` blocks a second concurrent call on the SAME instance.
 *    2. `pg_try_advisory_xact_lock` on a dedicated transaction blocks
 *       concurrent runs across replicas. The lock is auto-released when the
 *       lock-holding transaction commits (xact-scoped), so a crashed replica
 *       cannot leave the lock orphaned.
 *
 *  The lock-holding transaction does no business work — it just sits idle
 *  for the duration of the pass. All actual reconciliation queries use the
 *  regular `db` pool so reads/writes don't pile onto a long-lived tx. */
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
        try { await lockTrx.rollback() } catch { /* swallow */ }
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


/**
 * Reconcile active subscriptions with Stripe to fix drift. Pulls Stripe's
 * canonical state via auto-paginated `subscriptions.list` rather than
 * one-retrieve-per-row, cutting round-trips from N to ceil(N/100).
 */
async function reconcileSubscriptions(): Promise<void> {
  const stripe = getStripe()

  // Index local rows by stripe_subscription_id for O(1) drift comparison.
  const localRows = await db('subscriptions')
    .whereNotNull('stripe_subscription_id')
    .select('user_id', 'stripe_subscription_id', 'tier', 'status', 'cancel_at_period_end')
  const byStripeId = new Map<string, typeof localRows[number]>()
  for (const row of localRows) byStripeId.set(row.stripe_subscription_id, row)

  // Auto-paginate every Stripe subscription so we also catch new subs
  // created via the Customer Portal that never produced a checkout.session
  // event. Status='all' returns canceled rows too — we want those to
  // detect divergence.
  for await (const stripeSub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    if (shuttingDown) {
      reconcilerLogger.warn('shutdown signaled — aborting reconcileSubscriptions mid-pass')
      return
    }
    const local = byStripeId.get(stripeSub.id)

    const cancelAtPeriodEnd = !!stripeSub.cancel_at_period_end
    const stripeStatus = stripeSub.status === 'active' || stripeSub.status === 'trialing'
      ? 'active'
      : stripeSub.status === 'canceled'
        ? 'canceled'
        : 'past_due'
    const stripeTier = stripeStatus === 'active' ? 'premium' : 'free'

    try {
      if (!local) {
        // Stripe knows about this sub, we don't. Try to recover via
        // metadata.userId.
        const userId = stripeSub.metadata?.['userId']
        if (typeof userId === 'string' && userId.length > 0) {
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

/**
 * Repair customers with a stripe_customer_id but no stripe_subscription_id.
 * These are users whose /checkout call created a Stripe customer but where
 * the checkout.session.completed webhook was lost.
 */
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
      // List active and trialing subs for this customer. If there's one,
      // the checkout completed at Stripe but we missed the webhook.
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

/**
 * Downgrade past_due subscriptions after grace period expires. Uses
 * past_due_since (set on the transition into past_due) rather than
 * updated_at, so dunning retries don't reset the clock.
 */
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
