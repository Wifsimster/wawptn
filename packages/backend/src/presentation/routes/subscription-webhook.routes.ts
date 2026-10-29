import { Router } from 'express'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import {
  getStripe,
  isStripeError,
  stripeErrorContext,
  verifyWebhookSignature,
} from '../../infrastructure/stripe/stripe-client.js'
import {
  incrementWebhookReceived,
  incrementSignatureFailure,
  incrementWebhookDuplicate,
  incrementWebhookSuccess,
  incrementWebhookFailure,
} from '../../infrastructure/stripe/webhook-metrics.js'
import { env } from '../../config/env.js'
import { db } from '../../infrastructure/database/connection.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { claimStripeEvent, handleStripeEvent } from '../../domain/stripe-event-handlers.js'

export const subscriptionWebhookRouter = Router()

const subLogger = logger.child({ module: 'subscription-webhook' })

subscriptionWebhookRouter.post('/', async (req: Request, res: Response) => {
  incrementWebhookReceived()
  const signature = req.headers['stripe-signature']

  if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
    incrementSignatureFailure()
    res.status(400).json({ error: 'missing_signature' })
    return
  }

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(
      req.body,
      typeof signature === 'string' ? signature : signature[0] ?? '',
    )
  } catch (error) {
    incrementSignatureFailure()
    subLogger.warn({ error: String(error) }, 'webhook signature verification failed')
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  const claimed = await claimStripeEvent(event.id, event.type)
  if (!claimed) {
    incrementWebhookDuplicate()
    res.json({ received: true, duplicate: true })
    return
  }

  const stripe = getStripe()

  try {
    await db.transaction(async (trx) => {
      await handleStripeEvent(trx, stripe, event)
      await trx('stripe_events')
        .where({ event_id: event.id })
        .update({ status: 'success', last_attempted_at: trx.fn.now() })
    })

    incrementWebhookSuccess(event.type)
    res.json({ received: true })
  } catch (error) {
    incrementWebhookFailure(event.type)
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
      res.status(200).json({ received: true, error: 'permanent_failure' })
    }
  }
})
