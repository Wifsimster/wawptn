import Stripe from 'stripe'
import { env } from '../../config/env.js'

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    })
  }
  return stripeInstance
}

export function isStripeEnabled(): boolean {
  return !!env.STRIPE_SECRET_KEY
}
