import { Router } from 'express'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { getStripe, isStripeError, stripeErrorContext } from '../../infrastructure/stripe/stripe-client.js'
import { env } from '../../config/env.js'
import { isCadence, resolvePriceId, isAnnualAvailable, BILLING_CATALOG, type Cadence } from '../../config/billing.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { isInPastDueGrace } from '../../domain/subscription-service.js'

export const subscriptionRoutes = Router()

const subLogger = logger.child({ module: 'subscription' })

subscriptionRoutes.get('/me', async (req: Request, res: Response) => {
  try {
    const [user, subscription] = await Promise.all([
      db('users')
        .where({ id: req.userId })
        .select('is_admin', 'admin_granted_premium')
        .first(),
      db('subscriptions')
        .where({ user_id: req.userId })
        .select('tier', 'status', 'current_period_end', 'cancel_at_period_end', 'stripe_customer_id', 'past_due_since')
        .first(),
    ])

    const hasStripeCustomer = !!subscription?.stripe_customer_id

    if (user?.is_admin || user?.admin_granted_premium) {
      res.json({
        tier: 'premium',
        status: 'active',
        currentPeriodEnd: subscription?.current_period_end || null,
        cancelAtPeriodEnd: false,
        source: hasStripeCustomer ? 'stripe' : 'admin_grant',
      })
      return
    }

    res.json({
      tier: isInPastDueGrace(subscription) ? 'premium' : (subscription?.tier || 'free'),
      status: subscription?.status || 'inactive',
      currentPeriodEnd: subscription?.current_period_end || null,
      cancelAtPeriodEnd: !!subscription?.cancel_at_period_end,
      source: hasStripeCustomer ? 'stripe' : 'none',
    })
  } catch (error) {
    subLogger.error({ error: String(error) }, 'failed to get status')
    res.status(500).json({ error: 'internal', message: 'Failed to get subscription status' })
  }
})

const CATALOG_CACHE_TTL_MS = 5 * 60_000
let catalogCache: { value: Array<{ cadence: Cadence; priceId: string; unitAmount: number | null; currency: string | null; default: boolean }>; expiresAt: number } | null = null

subscriptionRoutes.get('/catalog', async (_req: Request, res: Response) => {
  try {
    const now = Date.now()
    if (catalogCache && catalogCache.expiresAt > now) {
      res.json({ entries: catalogCache.value, annualAvailable: isAnnualAvailable() })
      return
    }

    const stripe = getStripe()
    const entries: Array<{ cadence: Cadence; priceId: string; unitAmount: number | null; currency: string | null; default: boolean }> = []

    for (const entry of BILLING_CATALOG) {
      const priceId = resolvePriceId(entry.cadence)
      if (!priceId) continue
      try {
        const price = await stripe.prices.retrieve(priceId)
        entries.push({
          cadence: entry.cadence,
          priceId,
          unitAmount: typeof price.unit_amount === 'number' ? price.unit_amount : null,
          currency: typeof price.currency === 'string' ? price.currency : null,
          default: entry.default,
        })
      } catch (err) {
        subLogger.warn({ priceId, error: String(err) }, 'catalog: failed to retrieve price')
      }
    }

    catalogCache = { value: entries, expiresAt: now + CATALOG_CACHE_TTL_MS }
    res.json({ entries, annualAvailable: isAnnualAvailable() })
  } catch (error) {
    subLogger.error({ error: String(error) }, 'failed to build catalog')
    res.status(500).json({ error: 'internal', message: 'Failed to load catalog' })
  }
})

subscriptionRoutes.post('/checkout', async (req: Request, res: Response) => {
  try {
    const stripe = getStripe()
    const userId = req.userId!

    const requestedCadence: unknown = (req.body as { cadence?: unknown } | undefined)?.cadence
    const cadence: Cadence = isCadence(requestedCadence) ? requestedCadence : 'monthly'
    const priceId = resolvePriceId(cadence)
    if (!priceId) {
      res.status(400).json({ error: 'cadence_unavailable', message: `Cadence "${cadence}" is not configured` })
      return
    }

    const subscription = await db('subscriptions')
      .where({ user_id: userId })
      .first()

    if (subscription?.stripe_subscription_id && (subscription.status === 'active' || subscription.status === 'past_due')) {
      res.status(409).json({ error: 'already_subscribed', message: 'You already have a subscription — manage it from the billing portal' })
      return
    }

    let customerId = subscription?.stripe_customer_id

    if (customerId) {
      const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
      const live = existing.data.some((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
      if (live) {
        res.status(409).json({ error: 'already_subscribed', message: 'You already have a subscription — manage it from the billing portal' })
        return
      }
    }

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

    const bucket = Math.floor(Date.now() / (5 * 60_000))

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.CORS_ORIGIN}/subscription?success=true`,
      cancel_url: `${env.CORS_ORIGIN}/subscription?canceled=true`,
      client_reference_id: userId,
      subscription_data: { metadata: { userId, cadence } },
      metadata: { userId, cadence },
      allow_promotion_codes: true,
    }

    if (env.STRIPE_AUTOMATIC_TAX_ENABLED) {
      sessionParams.automatic_tax = { enabled: true }
      sessionParams.tax_id_collection = { enabled: true }
      sessionParams.customer_update = { address: 'auto', name: 'auto' }
    }

    const session = await stripe.checkout.sessions.create(
      sessionParams,
      { idempotencyKey: `checkout:${userId}:${priceId}:${bucket}` },
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

    const bucket = Math.floor(Date.now() / (24 * 60 * 60_000))

    const session = await stripe.billingPortal.sessions.create(
      {
        customer: subscription.stripe_customer_id,
        return_url: `${env.CORS_ORIGIN}/subscription`,
        ...(env.STRIPE_PORTAL_CONFIG_ID
          ? { configuration: env.STRIPE_PORTAL_CONFIG_ID }
          : {}),
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

export { subscriptionWebhookRouter } from './subscription-webhook.routes.js'
