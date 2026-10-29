import { create } from 'zustand'
import { api } from '@/lib/api'

export type SubscriptionTier = 'free' | 'premium'
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'inactive'

const STORAGE_KEY = 'wawptn:subscription:v1'

interface SubscriptionState {
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  source: 'stripe' | 'admin_grant' | 'none'
  loading: boolean
  hydrated: boolean
  fetchSubscription: () => Promise<void>
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
  }
}

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

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const snapshot = JSON.parse(e.newValue) as SubscriptionSnapshot
      useSubscriptionStore.getState().hydrateFromStorage(snapshot)
    } catch {
    }
  })
}

export function selectIsPremium(s: Pick<SubscriptionState, 'tier' | 'status'>): boolean {
  return s.tier === 'premium' && (s.status === 'active' || s.status === 'past_due')
}
