import { Router } from 'express'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { getStripe, isStripeError, stripeErrorContext } from '../../infrastructure/stripe/stripe-client.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

/**
 * User-facing subscription routes (auth required, CSRF guarded).
 *
 * The Stripe webhook lives in subscription-webhook.routes.ts so it can be
 * mounted ahead of body parsing and without auth/CSRF — see that file
 * for rationale. Per-event business logic lives in
 * domain/stripe-event-handlers.ts.
 */
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

// Re-export the webhook router from its dedicated file so existing
// imports of `subscriptionWebhookRouter` from this module keep working
// without code churn at the index.ts mount point.
export { subscriptionWebhookRouter } from './subscription-webhook.routes.js'
