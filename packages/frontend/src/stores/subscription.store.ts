import { create } from 'zustand'
import { api } from '@/lib/api'

export type SubscriptionTier = 'free' | 'premium'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'inactive'

interface SubscriptionState {
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  loading: boolean
  /** True after the first successful fetch — lets the UI distinguish
   *  "we don't know yet" (loading + !hydrated) from "user really is free"
   *  (loading=false + hydrated). Avoids a flash of "free" copy on a
   *  premium user reloading the page. */
  hydrated: boolean
  fetchSubscription: () => Promise<void>
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  status: 'inactive',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,
  hydrated: false,
  fetchSubscription: async () => {
    try {
      const data = await api.getSubscription()
      set({
        tier: data.tier,
        status: data.status,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        loading: false,
        hydrated: true,
      })
    } catch {
      // A transient network blip used to wipe the store back to
      // free/inactive — which made gates fire on a paying user mid-session.
      // Preserve last-known good state once we've hydrated; only flip
      // loading=false so the UI stops spinning.
      const { hydrated } = get()
      if (!hydrated) {
        set({
          tier: 'free',
          status: 'inactive',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          loading: false,
        })
      } else {
        set({ loading: false })
      }
    }
  },
}))

/** Single source of truth for "should we unlock premium UI?". Both the
 *  PremiumGate and the SubscriptionPage card derive their `isPremium`
 *  from this — previously SubscriptionPage allowed `status==='canceled'`
 *  too, which produced a "Premium" label while gates fired elsewhere.
 *  Definition: tier is premium AND status is active. A user who has
 *  scheduled cancellation but is still in their paid period satisfies
 *  this (Stripe keeps status='active' until period_end). */
export function selectIsPremium(s: Pick<SubscriptionState, 'tier' | 'status'>): boolean {
  return s.tier === 'premium' && s.status === 'active'
}
