import { create } from 'zustand'
import { api } from '@/lib/api'

interface SubscriptionState {
  tier: 'free' | 'premium'
  status: 'active' | 'past_due' | 'canceled' | 'inactive'
  currentPeriodEnd: string | null
  loading: boolean
  fetchSubscription: () => Promise<void>
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  tier: 'free',
  status: 'inactive',
  currentPeriodEnd: null,
  loading: true,
  fetchSubscription: async () => {
    try {
      const data = await api.getSubscription()
      set({ tier: data.tier, status: data.status, currentPeriodEnd: data.currentPeriodEnd, loading: false })
    } catch {
      set({ tier: 'free', status: 'inactive', currentPeriodEnd: null, loading: false })
    }
  },
}))
