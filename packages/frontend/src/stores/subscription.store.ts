import { create } from 'zustand'
import { api } from '@/lib/api'

export type SubscriptionTier = 'free' | 'premium'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'inactive'

/** localStorage key for cross-tab sync. When tab A pays and the webhook
 *  flips its store to premium, tab B picks up the change via the
 *  `storage` event without waiting for its own fetch cycle. */
const STORAGE_KEY = 'wawptn:subscription:v1'

interface SubscriptionState {
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  source: 'stripe' | 'admin_grant' | 'none'
  loading: boolean
  /** True after the first successful fetch — lets the UI distinguish
   *  "we don't know yet" (loading + !hydrated) from "user really is free"
   *  (loading=false + hydrated). Avoids a flash of "free" copy on a
   *  premium user reloading the page. */
  hydrated: boolean
  fetchSubscription: () => Promise<void>
  /** Apply state pushed from another tab via the `storage` event. Skips
   *  the network round-trip entirely. */
  hydrateFromStorage: (snapshot: SubscriptionSnapshot) => void
}

interface SubscriptionSnapshot {
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  source: 'stripe' | 'admin_grant' | 'none'
}

function readSnapshot(): SubscriptionSnapshot | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SubscriptionSnapshot
  } catch {
    return null
  }
}

function writeSnapshot(s: SubscriptionSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Quota / private mode — silently degrade; the in-memory store still works.
  }
}

// Seed from localStorage so a fresh tab doesn't flash "free" before the
// first /me fetch returns. The snapshot is written by every successful
// fetchSubscription call, so it's authoritative as of the last fetch.
const initialSnapshot = readSnapshot()

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: initialSnapshot?.tier ?? 'free',
  status: initialSnapshot?.status ?? 'inactive',
  currentPeriodEnd: initialSnapshot?.currentPeriodEnd ?? null,
  cancelAtPeriodEnd: initialSnapshot?.cancelAtPeriodEnd ?? false,
  source: initialSnapshot?.source ?? 'none',
  loading: true,
  hydrated: !!initialSnapshot,
  fetchSubscription: async () => {
    try {
      const data = await api.getSubscription()
      const snapshot: SubscriptionSnapshot = {
        tier: data.tier,
        status: data.status,
        currentPeriodEnd: data.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        source: data.source,
      }
      writeSnapshot(snapshot)
      set({ ...snapshot, loading: false, hydrated: true })
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
          source: 'none',
          loading: false,
        })
      } else {
        set({ loading: false })
      }
    }
  },
  hydrateFromStorage: (snapshot) => {
    set({ ...snapshot, loading: false, hydrated: true })
  },
}))

// Cross-tab sync — listen for storage events from other tabs/windows.
// Only fires in browsers where localStorage is observable (skipped in
// SSR / tests where window is undefined).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const snapshot = JSON.parse(e.newValue) as SubscriptionSnapshot
      useSubscriptionStore.getState().hydrateFromStorage(snapshot)
    } catch {
      // Malformed payload — ignore; the next fetch will reconcile.
    }
  })
}

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
