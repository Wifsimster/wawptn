import { env } from './env.js'

/** Subscription cadence — exposed to API callers (frontend toggle) and to
 *  the checkout/webhook layer to resolve the right Stripe price.
 *
 *  Why a discrete enum instead of just a price ID string from the client:
 *  - The price ID is server-side only. The client picks a *cadence* and the
 *    server maps it to the configured price ID. A hostile client cannot
 *    inject an arbitrary `price_xxx`.
 *  - The set of supported cadences is stable; adding `lifetime` or
 *    `quarterly` later is one entry in the catalog. */
export type Cadence = 'monthly' | 'yearly'

export const CADENCES: readonly Cadence[] = ['monthly', 'yearly'] as const

export function isCadence(value: unknown): value is Cadence {
  return value === 'monthly' || value === 'yearly'
}

interface CatalogEntry {
  cadence: Cadence
  /** Stable Stripe `lookup_key` posted on the live + test prices. The catalog
   *  resolves the price ID via `stripe.prices.list({ lookup_keys })` at
   *  boot, so a price rotation in Stripe does not require an env change. */
  lookupKey: string
  /** Default selection in the UI when a user lands on the upgrade page
   *  without an explicit cadence — annual is pre-selected to push ARPU
   *  per converted user without a hard sell. */
  default: boolean
}

/** WAWPTN Premium catalog. Amounts are deliberately NOT stored here:
 *  Stripe is the single source of truth for price. The frontend reads the
 *  resolved amount from `/api/subscription/catalog` (populated at boot
 *  from `stripe.prices.list`). */
export const BILLING_CATALOG: readonly CatalogEntry[] = [
  { cadence: 'monthly', lookupKey: 'wawptn_premium_monthly', default: false },
  { cadence: 'yearly',  lookupKey: 'wawptn_premium_yearly',  default: true  },
] as const

/** Resolve the configured Stripe price ID for a given cadence from env.
 *  Falls back to `STRIPE_PRICE_ID` when the cadence-specific var is unset
 *  so existing single-price deployments keep working unchanged.
 *
 *  Returns null when the requested cadence is not configured — callers
 *  should treat this as "cadence unavailable" and either reject the
 *  request or hide the UI affordance, NOT silently fall back to the other
 *  cadence (which is exactly the kind of price substitution the Toko
 *  incident exposed). */
export function resolvePriceId(cadence: Cadence): string | null {
  if (cadence === 'monthly') {
    return env.STRIPE_PRICE_ID_MONTHLY || env.STRIPE_PRICE_ID || null
  }
  return env.STRIPE_PRICE_ID_YEARLY || null
}

/** True when both monthly and yearly are configured — UI uses this to
 *  decide whether to render the cadence toggle or fall back to a single
 *  CTA. */
export function isAnnualAvailable(): boolean {
  return !!resolvePriceId('yearly')
}

/** All configured price IDs across the catalog. Drives the boot-time
 *  product-assertion in `validateEnv()` and could later back an explicit
 *  webhook allowlist. */
export function getConfiguredPriceIds(): string[] {
  const ids = new Set<string>()
  for (const entry of BILLING_CATALOG) {
    const id = resolvePriceId(entry.cadence)
    if (id) ids.add(id)
  }
  return [...ids]
}
