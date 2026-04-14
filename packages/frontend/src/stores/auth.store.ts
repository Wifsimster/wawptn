import { create } from 'zustand'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { useSubscriptionStore } from '@/stores/subscription.store'

interface AuthState {
  user: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; isAdmin: boolean } | null
  loading: boolean
  fetchUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    const wasLoggedIn = get().user !== null
    try {
      const user = await api.getMe()
      if (user) {
        set({ user, loading: false })
        // Only fire user.login the first time we observe a session in this
        // tab — otherwise every re-hydration would pollute the funnel.
        if (!wasLoggedIn) {
          track('user.login')
        }
        // Fetch subscription state after successful auth
        useSubscriptionStore.getState().fetchSubscription()
      } else {
        set({ user: null, loading: false })
      }
    } catch {
      set({ user: null, loading: false })
    }
  },
  logout: async () => {
    await api.logout()
    set({ user: null })
  },
}))
