import { create } from 'zustand'
import { api } from '@/lib/api'

interface SubscriptionState {
  tier: 'free' | 'premium'
  status: 'active' | 'past_due' | 'canceled' | 'inactive'
  currentPeriodEnd: string | null
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
  loading: true,
  hydrated: false,
  fetchSubscription: async () => {
    try {
      const data = await api.getSubscription()
      set({
        tier: data.tier,
        status: data.status,
        currentPeriodEnd: data.currentPeriodEnd,
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
        set({ tier: 'free', status: 'inactive', currentPeriodEnd: null, loading: false })
      } else {
        set({ loading: false })
      }
    }
  },
}))
