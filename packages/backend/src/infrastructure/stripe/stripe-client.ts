import Stripe from 'stripe'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'

let stripeInstance: Stripe | null = null

const stripeLogger = logger.child({ module: 'stripe' })

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }

    const mode = env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'
    stripeLogger.info({ mode, apiVersion: '2026-02-25.clover' }, 'initializing stripe client')

    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      // 2 retries on connection / 5xx errors; default is 0 which makes the
      // reconciler fail every transient blip.
      maxNetworkRetries: 2,
      timeout: 20_000,
    })
  }
  return stripeInstance
}

export function isStripeEnabled(): boolean {
  return !!env.STRIPE_SECRET_KEY
}

/** Live or test mode, derived from the secret key prefix. Surfaced on the
 *  /admin/subscription-health endpoint so ops can spot a mode mismatch. */
export function getStripeMode(): 'live' | 'test' | 'unconfigured' {
  if (!env.STRIPE_SECRET_KEY) return 'unconfigured'
  return env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'
}

/** Type guard around the Stripe SDK error hierarchy. Lets call sites map
 *  4xx Stripe errors (card declined, invalid request) to 4xx HTTP responses
 *  instead of flattening everything to 500. */
export function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError
}

/** Build a structured log payload from a Stripe SDK error — captures
 *  request_id, type, code, status code so a failure can be looked up in
 *  the Stripe dashboard logs. */
export function stripeErrorContext(err: unknown): Record<string, unknown> {
  if (!isStripeError(err)) return { error: String(err) }
  return {
    type: err.type,
    code: err.code,
    statusCode: err.statusCode,
    requestId: err.requestId,
    message: err.message,
  }
}
