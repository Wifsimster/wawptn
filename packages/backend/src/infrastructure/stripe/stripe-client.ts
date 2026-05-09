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

    const mode = /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? 'live' : 'test'
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
  return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? 'live' : 'test'
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

/** Parse `STRIPE_WEBHOOK_SECRET` into one or more secrets. Stripe lets
 *  you have two active webhook signing secrets at the same time during
 *  rotation: configure both as a comma-separated list and the webhook
 *  handler tries each one. Once the old secret is removed at the
 *  dashboard, drop it from env on the next deploy. */
export function getWebhookSecrets(): string[] {
  return env.STRIPE_WEBHOOK_SECRET
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Verify a Stripe webhook signature against any of the configured
 *  secrets. Returns the parsed Event on success, throws on failure.
 *  Tries each secret in order; the first that verifies wins. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): Stripe.Event {
  const secrets = getWebhookSecrets()
  if (secrets.length === 0) throw new Error('no webhook secrets configured')

  const stripe = getStripe()
  let lastError: unknown
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch (error) {
      lastError = error
      continue
    }
  }
  throw lastError ?? new Error('signature verification failed')
}
