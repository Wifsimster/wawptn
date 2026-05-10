import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/config/env.js', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_xxx',
    STRIPE_PRODUCT_ID: '',
    STRIPE_PRICE_ID: '',
    STRIPE_PRICE_ID_MONTHLY: '',
    STRIPE_PRICE_ID_YEARLY: '',
  },
}))

const stripeMock = vi.hoisted(() => ({
  prices: { retrieve: vi.fn() },
}))

vi.mock('@/infrastructure/stripe/stripe-client.js', () => ({
  getStripe: () => stripeMock,
  isStripeEnabled: () => true,
}))

vi.mock('@/infrastructure/logger/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import { env } from '@/config/env.js'
import { assertConfiguredPricesBelongToProduct } from '../billing-bootstrap.js'

describe('assertConfiguredPricesBelongToProduct', () => {
  beforeEach(() => {
    env.STRIPE_PRODUCT_ID = ''
    env.STRIPE_PRICE_ID = ''
    env.STRIPE_PRICE_ID_MONTHLY = ''
    env.STRIPE_PRICE_ID_YEARLY = ''
    stripeMock.prices.retrieve.mockReset()
  })

  it('no-ops when STRIPE_PRODUCT_ID is unset (opt-in guardrail)', async () => {
    env.STRIPE_PRICE_ID_MONTHLY = 'price_monthly'
    await expect(assertConfiguredPricesBelongToProduct()).resolves.toBeUndefined()
    expect(stripeMock.prices.retrieve).not.toHaveBeenCalled()
  })

  it('passes when every configured price belongs to the expected product', async () => {
    env.STRIPE_PRODUCT_ID = 'prod_wawptn'
    env.STRIPE_PRICE_ID_MONTHLY = 'price_m'
    env.STRIPE_PRICE_ID_YEARLY = 'price_y'
    stripeMock.prices.retrieve.mockImplementation(async (id: string) => ({
      id,
      product: 'prod_wawptn',
      lookup_key: id,
      recurring: { interval: id === 'price_m' ? 'month' : 'year' },
    }))

    await expect(assertConfiguredPricesBelongToProduct()).resolves.toBeUndefined()
    expect(stripeMock.prices.retrieve).toHaveBeenCalledTimes(2)
  })

  it('throws when a configured price points at the wrong product (Toko scenario)', async () => {
    env.STRIPE_PRODUCT_ID = 'prod_wawptn'
    env.STRIPE_PRICE_ID_MONTHLY = 'price_toko'
    stripeMock.prices.retrieve.mockResolvedValueOnce({
      id: 'price_toko',
      product: 'prod_toko',
      recurring: { interval: 'month' },
    })

    await expect(assertConfiguredPricesBelongToProduct()).rejects.toThrow(/price_toko.*prod_toko/)
  })

  it('handles the expanded-product object form', async () => {
    env.STRIPE_PRODUCT_ID = 'prod_wawptn'
    env.STRIPE_PRICE_ID_MONTHLY = 'price_m'
    stripeMock.prices.retrieve.mockResolvedValueOnce({
      id: 'price_m',
      product: { id: 'prod_wawptn', name: 'WAWPTN Premium' },
      recurring: { interval: 'month' },
    })

    await expect(assertConfiguredPricesBelongToProduct()).resolves.toBeUndefined()
  })
})
