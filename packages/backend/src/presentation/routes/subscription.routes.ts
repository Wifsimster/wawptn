import { Router } from 'express'
import type { Request, Response } from 'express'
import { getStripe } from '../../infrastructure/stripe/stripe-client.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'

export const subscriptionRoutes = Router()

// GET /api/subscription/me — current subscription state
subscriptionRoutes.get('/me', async (req: Request, res: Response) => {
  try {
    const subscription = await db('subscriptions')
      .where({ user_id: req.userId })
      .select('tier', 'status', 'current_period_end')
      .first()

    res.json({
      tier: subscription?.tier || 'free',
      status: subscription?.status || 'inactive',
      currentPeriodEnd: subscription?.current_period_end || null,
    })
  } catch (error) {
    logger.error({ error: String(error) }, 'subscription: failed to get status')
    res.status(500).json({ error: 'internal', message: 'Failed to get subscription status' })
  }
})

// POST /api/subscription/checkout — create Stripe Checkout Session
subscriptionRoutes.post('/checkout', async (req: Request, res: Response) => {
  try {
    const stripe = getStripe()

    // Get or create Stripe customer
    let subscription = await db('subscriptions')
      .where({ user_id: req.userId })
      .first()

    let customerId = subscription?.stripe_customer_id

    if (!customerId) {
      const user = await db('users').where({ id: req.userId }).select('display_name').first()
      const customer = await stripe.customers.create({
        metadata: { userId: req.userId! },
        name: user?.display_name || undefined,
      })
      customerId = customer.id

      if (subscription) {
        await db('subscriptions')
          .where({ user_id: req.userId })
          .update({ stripe_customer_id: customerId, updated_at: db.fn.now() })
      } else {
        await db('subscriptions').insert({
          user_id: req.userId,
          stripe_customer_id: customerId,
        })
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${env.CORS_ORIGIN}/subscription?success=true`,
      cancel_url: `${env.CORS_ORIGIN}/subscription?canceled=true`,
      client_reference_id: req.userId!,
    })

    res.json({ url: session.url })
  } catch (error) {
    logger.error({ error: String(error) }, 'subscription: failed to create checkout session')
    res.status(500).json({ error: 'internal', message: 'Failed to create checkout session' })
  }
})

// POST /api/subscription/portal — create Stripe Customer Portal session
subscriptionRoutes.post('/portal', async (req: Request, res: Response) => {
  try {
    const stripe = getStripe()

    const subscription = await db('subscriptions')
      .where({ user_id: req.userId })
      .select('stripe_customer_id')
      .first()

    if (!subscription?.stripe_customer_id) {
      res.status(400).json({ error: 'no_subscription', message: 'No subscription found' })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${env.CORS_ORIGIN}/subscription`,
    })

    res.json({ url: session.url })
  } catch (error) {
    logger.error({ error: String(error) }, 'subscription: failed to create portal session')
    res.status(500).json({ error: 'internal', message: 'Failed to create portal session' })
  }
})

// Webhook route — mounted separately with raw body parser
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

subscriptionWebhookRouter.post('/', async (req: Request, res: Response) => {
  const stripe = getStripe()
  const signature = req.headers['stripe-signature']

  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ error: 'missing_signature' })
    return
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    logger.warn({ error: String(error) }, 'subscription: webhook signature verification failed')
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  // Idempotency check
  const existing = await db('stripe_events').where({ event_id: event.id }).first()
  if (existing) {
    res.json({ received: true, duplicate: true })
    return
  }

  try {
    await db('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
    })

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId)

          await db('subscriptions')
            .where({ stripe_customer_id: session.customer })
            .update({
              stripe_subscription_id: subscriptionId,
              tier: 'premium',
              status: 'active',
              current_period_end: getSubscriptionPeriodEnd(stripeSubscription.items),
              updated_at: db.fn.now(),
            })

          logger.info({ customerId: session.customer }, 'subscription: activated premium')
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const status = subscription.cancel_at_period_end ? 'canceled' : subscription.status === 'active' ? 'active' : 'past_due'
        const tier = subscription.status === 'active' ? 'premium' : 'free'

        await db('subscriptions')
          .where({ stripe_subscription_id: subscription.id })
          .update({
            tier,
            status,
            current_period_end: getSubscriptionPeriodEnd(subscription.items),
            updated_at: db.fn.now(),
          })

        logger.info({ subscriptionId: subscription.id, status, tier }, 'subscription: updated')
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object

        await db('subscriptions')
          .where({ stripe_subscription_id: subscription.id })
          .update({
            tier: 'free',
            status: 'canceled',
            updated_at: db.fn.now(),
          })

        logger.info({ subscriptionId: subscription.id }, 'subscription: canceled/deleted')
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subscriptionId = getInvoiceSubscriptionId(invoice)

        if (subscriptionId) {
          await db('subscriptions')
            .where({ stripe_subscription_id: subscriptionId })
            .update({
              status: 'past_due',
              updated_at: db.fn.now(),
            })

          logger.warn({ subscriptionId }, 'subscription: payment failed')
        }
        break
      }
    }

    res.json({ received: true })
  } catch (error) {
    logger.error({ error: String(error), eventId: event.id }, 'subscription: webhook processing error')
    res.status(500).json({ error: 'processing_error' })
  }
})
