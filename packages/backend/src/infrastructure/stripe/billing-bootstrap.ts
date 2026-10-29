import { env } from '../../config/env.js'
import { getConfiguredPriceIds } from '../../config/billing.js'
import { getStripe, isStripeEnabled } from './stripe-client.js'
import { logger } from '../logger/logger.js'

const bootLogger = logger.child({ module: 'billing-bootstrap' })

export async function assertConfiguredPricesBelongToProduct(): Promise<void> {
  if (!isStripeEnabled()) return
  if (!env.STRIPE_PRODUCT_ID) {
    bootLogger.warn(
      'STRIPE_PRODUCT_ID unset — skipping price/product assertion. Set it to guard against the Toko-style misconfiguration.',
    )
    return
  }

  const priceIds = getConfiguredPriceIds()
  if (priceIds.length === 0) return

  const stripe = getStripe()
  const expectedProduct = env.STRIPE_PRODUCT_ID

  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId)
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    if (productId !== expectedProduct) {
      throw new Error(
        `Stripe price/product mismatch: ${priceId} belongs to product ${productId}, expected ${expectedProduct}. Refusing to boot to prevent selling the wrong product.`,
      )
    }
    bootLogger.info(
      { priceId, productId, lookupKey: price.lookup_key, recurring: price.recurring?.interval },
      'price/product assertion ok',
    )
  }
}
