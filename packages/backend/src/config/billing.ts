import { env } from './env.js'

export type Cadence = 'monthly' | 'yearly'

export const CADENCES: readonly Cadence[] = ['monthly', 'yearly'] as const

export function isCadence(value: unknown): value is Cadence {
  return value === 'monthly' || value === 'yearly'
}

interface CatalogEntry {
  cadence: Cadence
  lookupKey: string
  default: boolean
}

export const BILLING_CATALOG: readonly CatalogEntry[] = [
  { cadence: 'monthly', lookupKey: 'wawptn_premium_monthly', default: false },
  { cadence: 'yearly',  lookupKey: 'wawptn_premium_yearly',  default: true  },
] as const

export function resolvePriceId(cadence: Cadence): string | null {
  if (cadence === 'monthly') {
    return env.STRIPE_PRICE_ID_MONTHLY || env.STRIPE_PRICE_ID || null
  }
  return env.STRIPE_PRICE_ID_YEARLY || null
}

export function isAnnualAvailable(): boolean {
  return !!resolvePriceId('yearly')
}

export function getConfiguredPriceIds(): string[] {
  const ids = new Set<string>()
  for (const entry of BILLING_CATALOG) {
    const id = resolvePriceId(entry.cadence)
    if (id) ids.add(id)
  }
  return [...ids]
}
