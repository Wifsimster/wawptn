import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/config/env.js', () => ({
  env: {
    STRIPE_PRICE_ID: '',
    STRIPE_PRICE_ID_MONTHLY: '',
    STRIPE_PRICE_ID_YEARLY: '',
  },
}))

import { env } from '@/config/env.js'
import {
  isCadence,
  resolvePriceId,
  isAnnualAvailable,
  getConfiguredPriceIds,
  BILLING_CATALOG,
} from '../billing.js'

describe('billing catalog', () => {
  beforeEach(() => {
    env.STRIPE_PRICE_ID = ''
    env.STRIPE_PRICE_ID_MONTHLY = ''
    env.STRIPE_PRICE_ID_YEARLY = ''
  })

  describe('isCadence', () => {
    it('accepts the supported cadences', () => {
      expect(isCadence('monthly')).toBe(true)
      expect(isCadence('yearly')).toBe(true)
    })

    it('rejects everything else, including objects and the empty string', () => {
      expect(isCadence('')).toBe(false)
      expect(isCadence('weekly')).toBe(false)
      expect(isCadence(undefined)).toBe(false)
      expect(isCadence(null)).toBe(false)
      expect(isCadence({})).toBe(false)
      expect(isCadence(42)).toBe(false)
    })
  })

  describe('BILLING_CATALOG', () => {
    it('has exactly one default entry', () => {
      const defaults = BILLING_CATALOG.filter((e) => e.default)
      expect(defaults).toHaveLength(1)
    })

    it('defaults to yearly to push ARPU per converted user', () => {
      const fallback = BILLING_CATALOG.find((e) => e.default)
      expect(fallback?.cadence).toBe('yearly')
    })
  })

  describe('resolvePriceId', () => {
    it('returns the cadence-scoped var when set', () => {
      env.STRIPE_PRICE_ID_MONTHLY = 'price_monthly_x'
      env.STRIPE_PRICE_ID_YEARLY = 'price_yearly_x'
      expect(resolvePriceId('monthly')).toBe('price_monthly_x')
      expect(resolvePriceId('yearly')).toBe('price_yearly_x')
    })

    it('falls back to STRIPE_PRICE_ID for monthly when the cadence-scoped var is missing (back-compat)', () => {
      env.STRIPE_PRICE_ID = 'price_legacy'
      expect(resolvePriceId('monthly')).toBe('price_legacy')
    })

    it('does NOT fall back to STRIPE_PRICE_ID for yearly — silent fall-through is the Toko failure mode', () => {
      env.STRIPE_PRICE_ID = 'price_legacy_monthly'
      expect(resolvePriceId('yearly')).toBeNull()
    })

    it('returns null when nothing is configured', () => {
      expect(resolvePriceId('monthly')).toBeNull()
      expect(resolvePriceId('yearly')).toBeNull()
    })
  })

  describe('isAnnualAvailable', () => {
    it('is true only when the yearly price is explicitly configured', () => {
      env.STRIPE_PRICE_ID_YEARLY = 'price_yearly_x'
      expect(isAnnualAvailable()).toBe(true)
    })

    it('stays false when only the monthly is set', () => {
      env.STRIPE_PRICE_ID_MONTHLY = 'price_monthly_x'
      expect(isAnnualAvailable()).toBe(false)
    })

    it('stays false on legacy single-price deployments', () => {
      env.STRIPE_PRICE_ID = 'price_legacy'
      expect(isAnnualAvailable()).toBe(false)
    })
  })

  describe('getConfiguredPriceIds', () => {
    it('deduplicates when monthly aliases STRIPE_PRICE_ID', () => {
      env.STRIPE_PRICE_ID = 'price_legacy'
      env.STRIPE_PRICE_ID_MONTHLY = 'price_legacy'
      env.STRIPE_PRICE_ID_YEARLY = 'price_yearly_x'
      const ids = getConfiguredPriceIds()
      expect(ids).toHaveLength(2)
      expect(ids).toContain('price_legacy')
      expect(ids).toContain('price_yearly_x')
    })

    it('returns an empty list when nothing is configured', () => {
      expect(getConfiguredPriceIds()).toEqual([])
    })
  })
})
