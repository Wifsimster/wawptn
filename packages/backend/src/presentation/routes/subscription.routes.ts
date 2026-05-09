import { Router } from 'express'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import type { Knex } from 'knex'
import { getStripe, isStripeError, stripeErrorContext } from '../../infrastructure/stripe/stripe-client.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { invalidatePremiumCache } from '../../domain/subscription-service.js'
import { recordSystemAction, type AdminAuditAction } from '../../domain/admin-audit-log.js'

export const subscriptionRoutes = Router()

const subLogger = logger.child({ module: 'subscription' })

// GET /api/subscription/me — current subscription state
// Admins and admin-granted premium users are reported as active premium so
// the client-side PremiumGate unlocks features regardless of Stripe state.
subscriptionRoutes.get('/me', async (req: Request, res: Response) => {
  try {
    const [user, subscription] = await Promise.all([
      db('users')
        .where({ id: req.userId })
        .select('is_admin', 'admin_granted_premium')
        .first(),
      db('subscriptions')
        .where({ user_id: req.userId })
        .select('tier', 'status', 'current_period_end', 'cancel_at_period_end')
        .first(),
    ])

    if (user?.is_admin || user?.admin_granted_premium) {
      res.json({
        tier: 'premium',
        status: 'active',
        currentPeriodEnd: subscription?.current_period_end || null,
        cancelAtPeriodEnd: false,
      })
      return
    }

    res.json({
      tier: subscription?.tier || 'free',
      status: subscription?.status || 'inactive',
      currentPeriodEnd: subscription?.current_period_end || null,
      cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
    })
  } catch (error) {
    subLogger.error({ error: String(error) }, 'failed to get status')
    res.status(500).json({ error: 'internal', message: 'Failed to get subscription status' })
  }
})

// POST /api/subscription/checkout — create Stripe Checkout Session
subscriptionRoutes.post('/checkout', async (req: Request, res: Response) => {
  try {
    const stripe = getStripe()
    const userId = req.userId!

    // Get or create Stripe customer. The idempotency key keyed off userId
    // makes the customer-create call safe under concurrent double-clicks
    // (same key returns the same customer, no duplicates). The local
    // upsert on user_id covers the DB-side race.
    const subscription = await db('subscriptions')
      .where({ user_id: userId })
      .first()

    let customerId = subscription?.stripe_customer_id

    if (!customerId) {
      const user = await db('users')
        .where({ id: userId })
        .select('display_name', 'email')
        .first()

      const customer = await stripe.customers.create(
        {
          metadata: { userId },
          name: user?.display_name || undefined,
          email: user?.email || undefined,
        },
        { idempotencyKey: `customer:${userId}` },
      )
      customerId = customer.id

      await db('subscriptions')
        .insert({
          user_id: userId,
          stripe_customer_id: customerId,
        })
        .onConflict('user_id')
        .merge(['stripe_customer_id', 'updated_at'])
    }

    // 5-minute bucket: a determined double-click resolves to the same
    // Checkout Session, but an honest retry hours later gets a fresh one.
    const bucket = Math.floor(Date.now() / (5 * 60_000))

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${env.CORS_ORIGIN}/subscription?success=true`,
      cancel_url: `${env.CORS_ORIGIN}/subscription?canceled=true`,
      client_reference_id: userId,
      // Propagate userId onto the Subscription itself so webhook handlers
      // and the reconciler can identify the user from any Subscription
      // object — not just from the Checkout Session.
      subscription_data: { metadata: { userId } },
      metadata: { userId },
      allow_promotion_codes: true,
    }

    if (env.STRIPE_AUTOMATIC_TAX_ENABLED) {
      sessionParams.automatic_tax = { enabled: true }
      sessionParams.tax_id_collection = { enabled: true }
      sessionParams.customer_update = { address: 'auto', name: 'auto' }
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      { idempotencyKey: `checkout:${userId}:${env.STRIPE_PRICE_ID}:${bucket}` },
    )

    res.json({ url: session.url })
  } catch (error) {
    if (isStripeError(error)) {
      subLogger.warn(stripeErrorContext(error), 'checkout failed')
      const status = error.statusCode && error.statusCode < 500 ? 400 : 500
      res.status(status).json({ error: 'stripe_error', message: error.message })
      return
    }
    subLogger.error({ error: String(error) }, 'failed to create checkout session')
    res.status(500).json({ error: 'internal', message: 'Failed to create checkout session' })
  }
})

// POST /api/subscription/portal — create Stripe Customer Portal session
subscriptionRoutes.post('/portal', async (req: Request, res: Response) => {
  try {
    const stripe = getStripe()
    const userId = req.userId!

    const subscription = await db('subscriptions')
      .where({ user_id: userId })
      .select('stripe_customer_id')
      .first()

    if (!subscription?.stripe_customer_id) {
      res.status(400).json({ error: 'no_subscription', message: 'No subscription found' })
      return
    }

    // Per-day bucket: prevents portal-spam duplicates within a day, allows
    // a fresh session next day.
    const bucket = Math.floor(Date.now() / (24 * 60 * 60_000))

    const session = await stripe.billingPortal.sessions.create(
      {
        customer: subscription.stripe_customer_id,
        return_url: `${env.CORS_ORIGIN}/subscription`,
      },
      { idempotencyKey: `portal:${userId}:${bucket}` },
    )

    res.json({ url: session.url })
  } catch (error) {
    if (isStripeError(error)) {
      subLogger.warn(stripeErrorContext(error), 'portal failed')
      const status = error.statusCode && error.statusCode < 500 ? 400 : 500
      res.status(status).json({ error: 'stripe_error', message: error.message })
      return
    }
    subLogger.error({ error: String(error) }, 'failed to create portal session')
    res.status(500).json({ error: 'internal', message: 'Failed to create portal session' })
  }
})

// ─── Webhook ────────────────────────────────────────────────────────────────
// Mounted separately with raw body parser so signature verification gets
// the unparsed Buffer.
export const subscriptionWebhookRouter = Router()

/** Extract current_period_end from subscription items (Stripe SDK v20 / clover API) */
function getSubscriptionPeriodEnd(items: { data: Array<{ current_period_end: number }> }): Date | null {
  const item = items.data[0]
  if (!item) return null
  return new Date(item.current_period_end * 1000)
}

/** Extract subscription ID from an invoice's parent (Stripe SDK v20 / clover API) */
function getInvoiceSubscriptionId(invoice: { parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null }): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

/** Resolve the subscription a charge belongs to. The reviewer flagged
 *  charge.refunded firing for unrelated past invoices and silently nuking
 *  premium — this helper is the single place we answer "which sub did
 *  this charge pay for?". Retrieves the invoice if necessary so the
 *  answer is always authoritative. */
async function chargeSubscriptionId(stripe: Stripe, charge: Stripe.Charge): Promise<string | null> {
  let invoice: { parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null } | null = null
  if (typeof charge.invoice === 'string' && charge.invoice.length > 0) {
    invoice = await stripe.invoices.retrieve(charge.invoice) as unknown as typeof invoice
  } else if (charge.invoice && typeof charge.invoice === 'object') {
    invoice = charge.invoice as unknown as typeof invoice
  }
  if (!invoice) return null
  return getInvoiceSubscriptionId(invoice)
}

/** Extract userId from a Subscription's metadata (set by the Checkout flow
 *  via subscription_data.metadata). Falls back to null — the caller will
 *  resolve via stripe_customer_id lookup. */
function getUserIdFromSubscription(sub: Stripe.Subscription): string | null {
  const metaUser = sub.metadata?.['userId']
  return typeof metaUser === 'string' && metaUser.length > 0 ? metaUser : null
}

/** Map a Stripe Subscription's status to local (tier, status). The webhook
 *  handler always uses this rather than trusting the inbound event payload
 *  directly, so out-of-order delivery can't downgrade an active sub.
 *
 *  Rules:
 *  - active or trialing → premium / active (cancel_at_period_end is a
 *    separate flag, NOT a status flip)
 *  - past_due, unpaid, incomplete → free / past_due (3-day grace applies)
 *  - canceled, incomplete_expired → free / canceled (immediate downgrade,
 *    no grace — incomplete_expired means the initial payment never
 *    succeeded inside Stripe's retry window, so there's no legitimate
 *    "active" period to grace)
 */
function mapStripeStatus(sub: Stripe.Subscription): {
  tier: 'free' | 'premium'
  status: 'active' | 'past_due' | 'canceled' | 'inactive'
  cancelAtPeriodEnd: boolean
} {
  const cancelAtPeriodEnd = !!sub.cancel_at_period_end

  if (sub.status === 'active' || sub.status === 'trialing') {
    return { tier: 'premium', status: 'active', cancelAtPeriodEnd }
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return { tier: 'free', status: 'canceled', cancelAtPeriodEnd }
  }
  // past_due, unpaid, incomplete, paused — payment is recoverable
  return { tier: 'free', status: 'past_due', cancelAtPeriodEnd }
}

/** Resolve the local subscriptions row for a Stripe Subscription with a
 *  row-level lock so concurrent webhook deliveries for the same sub can't
 *  interleave reads with writes. Tries metadata.userId first (set by the
 *  Checkout flow), then falls back to stripe_customer_id. Caller must hold
 *  a transaction. */
async function findLocalSubscriptionForUpdate(
  trx: Knex.Transaction,
  stripeSub: Stripe.Subscription,
): Promise<{ user_id: string; status: string | null; past_due_since: Date | null } | null> {
  const userId = getUserIdFromSubscription(stripeSub)
  if (userId) {
    const row = await trx('subscriptions')
      .where({ user_id: userId })
      .select('user_id', 'status', 'past_due_since')
      .forUpdate()
      .first()
    if (row) return row
  }
  const customer = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id
  const row = await trx('subscriptions')
    .where({ stripe_customer_id: customer })
    .select('user_id', 'status', 'past_due_since')
    .forUpdate()
    .first()
  return row ?? null
}

/** Refetch the Subscription from Stripe and apply state. Centralised so
 *  every event handler converges on the same write path — out-of-order
 *  events self-heal because we always use Stripe's authoritative state.
 *
 *  Runs entirely inside the supplied transaction. The row read uses
 *  SELECT … FOR UPDATE so the read of `past_due_since` can't race with
 *  another worker writing the same row — closes the TOCTOU on the
 *  past_due transition detection. */
export async function applySubscriptionState(
  trx: Knex.Transaction,
  stripeSub: Stripe.Subscription,
  source: AdminAuditAction,
): Promise<void> {
  const local = await findLocalSubscriptionForUpdate(trx, stripeSub)
  const customer = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id

  const { tier, status, cancelAtPeriodEnd } = mapStripeStatus(stripeSub)
  const periodEnd = getSubscriptionPeriodEnd(stripeSub.items)

  // Capture past_due_since on the transition into past_due. Don't bump it
  // on subsequent updates — that's what made the grace period reset every
  // dunning retry. The locked read above ensures the previous-status check
  // sees the same row we're about to write.
  let pastDueSince: Date | null | undefined = undefined
  if (status === 'past_due') {
    if (local?.status !== 'past_due') pastDueSince = new Date()
  } else {
    pastDueSince = null
  }

  const update: Record<string, unknown> = {
    stripe_subscription_id: stripeSub.id,
    stripe_customer_id: customer,
    tier,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    current_period_end: periodEnd,
    updated_at: trx.fn.now(),
  }
  if (pastDueSince !== undefined) update['past_due_since'] = pastDueSince

  if (local) {
    await trx('subscriptions').where({ user_id: local.user_id }).update(update)
    invalidatePremiumCache(local.user_id)
    await recordSystemAction(source, local.user_id, {
      stripeSubscriptionId: stripeSub.id,
      stripeStatus: stripeSub.status,
      tier,
      status,
      cancelAtPeriodEnd,
    }, trx)
  } else {
    // No local row yet: this happens when /checkout's customers.create
    // succeeded but the local insert failed, or when a customer.subscription
    // event fires before the matching checkout.session.completed has been
    // processed. Try to recover via the Subscription metadata.
    const userId = getUserIdFromSubscription(stripeSub)
    if (userId) {
      await trx('subscriptions')
        .insert({
          user_id: userId,
          stripe_customer_id: customer,
          stripe_subscription_id: stripeSub.id,
          tier,
          status,
          cancel_at_period_end: cancelAtPeriodEnd,
          current_period_end: periodEnd,
          past_due_since: pastDueSince ?? null,
        })
        .onConflict('user_id')
        .merge()
      invalidatePremiumCache(userId)
      await recordSystemAction(source, userId, {
        stripeSubscriptionId: stripeSub.id,
        stripeStatus: stripeSub.status,
        recovered: true,
      }, trx)
    } else {
      subLogger.error(
        { stripeSubscriptionId: stripeSub.id, customer },
        'subscription event for unknown user — cannot resolve userId',
      )
    }
  }
}

subscriptionWebhookRouter.post('/', async (req: Request, res: Response) => {
  const stripe = getStripe()
  const signature = req.headers['stripe-signature']

  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ error: 'missing_signature' })
    return
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    subLogger.warn({ error: String(error) }, 'webhook signature verification failed')
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  // Atomic dedup-and-claim: insert with ON CONFLICT DO NOTHING. If we
  // claimed the row (rowCount === 1) we proceed; otherwise some other
  // delivery already processed it.
  //
  // Crucially the row starts in status='pending' — the success status is
  // written *after* the handler completes. This way a transient handler
  // failure leaves the row in 'pending'/'failure' and the next Stripe
  // retry can re-claim it (we look for status != 'success' on lookup).
  const claimed = await db.transaction(async (trx) => {
    const inserted = await trx('stripe_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        status: 'pending',
        attempt_count: 1,
      })
      .onConflict('event_id')
      .merge({
        attempt_count: trx.raw('stripe_events.attempt_count + 1'),
        last_attempted_at: trx.fn.now(),
      })
      .returning(['status', 'attempt_count'])

    const row = inserted[0]
    // If the existing row is already 'success', it's a true duplicate —
    // skip. Otherwise (pending/failure), we re-attempt.
    return row?.status !== 'success'
  })

  if (!claimed) {
    res.json({ received: true, duplicate: true })
    return
  }

  try {
    // Run business writes + the success-mark on stripe_events in a single
    // transaction with row-level locks. Either both commit or both roll
    // back — no more "state change committed but the audit row got lost"
    // and no more "stripe_events.success written, but the UPDATE that
    // preceded it failed".
    await db.transaction(async (trx) => {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object
          if (session.mode === 'subscription' && session.subscription) {
            const subscriptionId = typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
            // Re-fetch fresh state — out-of-order events self-heal.
            const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

            // Prefer client_reference_id (set by /checkout) so we can recover
            // the local row even if it was never inserted (zero-row UPDATE bug).
            const userId = (session.client_reference_id as string | null)
              ?? getUserIdFromSubscription(stripeSub)

            if (userId) {
              const customer = typeof session.customer === 'string'
                ? session.customer
                : session.customer?.id
              const { tier, status, cancelAtPeriodEnd } = mapStripeStatus(stripeSub)
              const periodEnd = getSubscriptionPeriodEnd(stripeSub.items)

              await trx('subscriptions')
                .insert({
                  user_id: userId,
                  stripe_customer_id: customer,
                  stripe_subscription_id: subscriptionId,
                  tier,
                  status,
                  cancel_at_period_end: cancelAtPeriodEnd,
                  current_period_end: periodEnd,
                })
                .onConflict('user_id')
                .merge([
                  'stripe_customer_id',
                  'stripe_subscription_id',
                  'tier',
                  'status',
                  'cancel_at_period_end',
                  'current_period_end',
                  'updated_at',
                ])

              invalidatePremiumCache(userId)
              await recordSystemAction('subscription.system.activate', userId, {
                stripeSubscriptionId: subscriptionId,
                stripeStatus: stripeSub.status,
              }, trx)
              subLogger.info({ userId, subscriptionId }, 'activated premium')
            } else {
              // No client_reference_id and no metadata.userId — this should
              // not happen with the new Checkout config, but log loudly.
              subLogger.error(
                { customerId: session.customer, subscriptionId },
                'checkout.session.completed without resolvable userId',
              )
            }
          }
          break
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          // Always re-fetch — defends against out-of-order delivery and
          // payload staleness.
          const incoming = event.data.object as Stripe.Subscription
          const fresh = await stripe.subscriptions.retrieve(incoming.id)
          const action: AdminAuditAction = event.type === 'customer.subscription.created'
            ? 'subscription.system.update'
            : (fresh.cancel_at_period_end ? 'subscription.system.cancel_scheduled' : 'subscription.system.update')
          await applySubscriptionState(trx, fresh, action)
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription
          const local = await findLocalSubscriptionForUpdate(trx, subscription)
          if (local) {
            await trx('subscriptions')
              .where({ user_id: local.user_id })
              .update({
                tier: 'free',
                status: 'canceled',
                cancel_at_period_end: false,
                past_due_since: null,
                updated_at: trx.fn.now(),
              })
            invalidatePremiumCache(local.user_id)
            await recordSystemAction('subscription.system.canceled', local.user_id, {
              stripeSubscriptionId: subscription.id,
            }, trx)
          }
          subLogger.info({ subscriptionId: subscription.id }, 'subscription canceled/deleted')
          break
        }

        case 'customer.subscription.trial_will_end': {
          const subscription = event.data.object as Stripe.Subscription
          const local = await findLocalSubscriptionForUpdate(trx, subscription)
          if (local) {
            await recordSystemAction('subscription.system.trial_started', local.user_id, {
              stripeSubscriptionId: subscription.id,
              trialEnd: subscription.trial_end,
            }, trx)
          }
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice
          const subscriptionId = getInvoiceSubscriptionId(
            invoice as unknown as Parameters<typeof getInvoiceSubscriptionId>[0],
          )
          if (subscriptionId) {
            const fresh = await stripe.subscriptions.retrieve(subscriptionId)
            await applySubscriptionState(trx, fresh, 'subscription.system.past_due')
            subLogger.warn({ subscriptionId }, 'payment failed')
          }
          break
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice
          const subscriptionId = getInvoiceSubscriptionId(
            invoice as unknown as Parameters<typeof getInvoiceSubscriptionId>[0],
          )
          if (subscriptionId) {
            // Recovery from past_due — refetch to pick up the new status.
            const fresh = await stripe.subscriptions.retrieve(subscriptionId)
            await applySubscriptionState(trx, fresh, 'subscription.system.recovered')
          }
          break
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge
          // Only revoke premium when the refunded charge belongs to the
          // user's CURRENT subscription. A charge.refunded event fires for
          // any charge on the customer — including one-off charges, partial
          // refunds, or refunds of an unrelated previous subscription that's
          // already been replaced. Without this check, a partial refund on
          // an old invoice silently nukes a paying user's premium.
          const subscriptionId = await chargeSubscriptionId(stripe, charge)
          const customer = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
          if (customer && subscriptionId) {
            const local = await trx('subscriptions')
              .where({ stripe_customer_id: customer })
              .select('user_id', 'stripe_subscription_id')
              .forUpdate()
              .first()
            if (local && local.stripe_subscription_id === subscriptionId) {
              // Treat full refunds (refunded === true) and amount_refunded
              // matching amount as a revocation; partial refunds are logged
              // but do not flip tier — Stripe-side accounting only.
              const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount
              if (fullyRefunded) {
                await trx('subscriptions')
                  .where({ user_id: local.user_id })
                  .update({ tier: 'free', status: 'canceled', updated_at: trx.fn.now() })
                invalidatePremiumCache(local.user_id)
                await recordSystemAction('subscription.system.refunded', local.user_id, {
                  chargeId: charge.id,
                  amount: charge.amount_refunded,
                  stripeSubscriptionId: local.stripe_subscription_id,
                }, trx)
                subLogger.warn({ chargeId: charge.id, userId: local.user_id }, 'charge refunded — premium revoked')
              } else {
                subLogger.info(
                  { chargeId: charge.id, userId: local.user_id, amountRefunded: charge.amount_refunded, amount: charge.amount },
                  'partial refund — premium retained',
                )
              }
            } else if (local) {
              subLogger.info(
                { chargeId: charge.id, userId: local.user_id, chargeSubId: subscriptionId, currentSubId: local.stripe_subscription_id },
                'refund for a non-current subscription — premium retained',
              )
            }
          }
          break
        }

        case 'charge.dispute.created':
        case 'charge.dispute.funds_withdrawn': {
          const dispute = event.data.object as Stripe.Dispute
          const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
          // Dispute objects don't have a customer field directly — look up
          // via the charge so we can scope the revocation to the current
          // subscription, mirroring the refund handler.
          const stripeCharge = await stripe.charges.retrieve(chargeId)
          const customer = typeof stripeCharge.customer === 'string' ? stripeCharge.customer : stripeCharge.customer?.id
          const subscriptionId = await chargeSubscriptionId(stripe, stripeCharge)
          if (customer && subscriptionId) {
            const local = await trx('subscriptions')
              .where({ stripe_customer_id: customer })
              .select('user_id', 'stripe_subscription_id')
              .forUpdate()
              .first()
            if (local && local.stripe_subscription_id === subscriptionId) {
              await trx('subscriptions')
                .where({ user_id: local.user_id })
                .update({ tier: 'free', status: 'canceled', updated_at: trx.fn.now() })
              invalidatePremiumCache(local.user_id)
              await recordSystemAction('subscription.system.disputed', local.user_id, {
                disputeId: dispute.id,
                reason: dispute.reason,
                stripeSubscriptionId: local.stripe_subscription_id,
              }, trx)
              subLogger.error({ disputeId: dispute.id, userId: local.user_id }, 'dispute opened — premium revoked')
            } else if (local) {
              subLogger.warn(
                { disputeId: dispute.id, userId: local.user_id, chargeSubId: subscriptionId, currentSubId: local.stripe_subscription_id },
                'dispute for a non-current subscription — premium retained',
              )
            }
          }
          break
        }
      }

      // Mark the event as processed inside the same transaction so the
      // success state can never be committed without the side-effects.
      await trx('stripe_events')
        .where({ event_id: event.id })
        .update({ status: 'success', last_attempted_at: trx.fn.now() })
    })

    res.json({ received: true })
  } catch (error) {
    // Mark the event as failed so a Stripe retry can re-claim it. Classify
    // the error: 4xx Stripe errors and known data-shape errors are
    // permanent failures (return 200 to stop retries); 5xx and network
    // errors are transient (return 500 so Stripe retries).
    const transient = isStripeError(error)
      ? (error.statusCode ?? 500) >= 500 || error.type === 'StripeConnectionError'
      : true

    await db('stripe_events')
      .where({ event_id: event.id })
      .update({
        status: 'failure',
        processing_error: String(error).slice(0, 4096),
        last_attempted_at: db.fn.now(),
      })

    subLogger.error(
      { ...stripeErrorContext(error), eventId: event.id, eventType: event.type, transient },
      'webhook processing error',
    )

    if (transient) {
      res.status(500).json({ error: 'processing_error' })
    } else {
      // Permanent failure: 200 stops Stripe from retrying. The failure is
      // recorded in stripe_events for the team to investigate.
      res.status(200).json({ received: true, error: 'permanent_failure' })
    }
  }
})
