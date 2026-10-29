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
      maxNetworkRetries: 2,
      timeout: 20_000,
    })
  }
  return stripeInstance
}

export function isStripeEnabled(): boolean {
  return !!env.STRIPE_SECRET_KEY
}

export function getStripeMode(): 'live' | 'test' | 'unconfigured' {
  if (!env.STRIPE_SECRET_KEY) return 'unconfigured'
  return /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) ? 'live' : 'test'
}

export function isStripeError(err: unknown): err is Stripe.errors.StripeError {
  return err instanceof Stripe.errors.StripeError
}

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

export function getWebhookSecrets(): string[] {
  return env.STRIPE_WEBHOOK_SECRET
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

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
