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

/**
 * Stripe webhook router.
 *
 * Mounted separately from the user-facing subscription routes (`/me`,
 * `/checkout`, `/portal`) so it can run BEFORE express.json() with a raw
 * body parser — signature verification needs the unparsed bytes — and
 * with NO auth/CSRF middleware (Stripe authenticates by signed payload).
 *
 * Responsibilities here are HTTP only:
 *   1. Verify signature, increment metrics
 *   2. Atomic dedup-and-claim against stripe_events
 *   3. Dispatch to the domain handlers inside a single transaction so
 *      side effects + the success-mark commit atomically
 *   4. Classify failures as transient (5xx — Stripe retries) vs permanent
 *      (200 — Stripe stops; we triage from stripe_events)
 *
 * All actual side-effect work lives in
 * `domain/stripe-event-handlers.ts` so it's testable without an Express
 * harness.
 */
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
      // Mark the event as processed inside the same transaction so the
      // success state can never be committed without the side-effects.
      await trx('stripe_events')
        .where({ event_id: event.id })
        .update({ status: 'success', last_attempted_at: trx.fn.now() })
    })

    incrementWebhookSuccess(event.type)
    res.json({ received: true })
  } catch (error) {
    incrementWebhookFailure(event.type)
    // Mark the event as failed so a Stripe retry can re-claim it.
    // Classify the error: 4xx Stripe errors and known data-shape errors
    // are permanent failures (return 200 to stop retries); 5xx and
    // network errors are transient (return 500 so Stripe retries).
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
      // Permanent failure: 200 stops Stripe from retrying. The failure
      // is recorded in stripe_events for the team to investigate.
      res.status(200).json({ received: true, error: 'permanent_failure' })
    }
  }
})
