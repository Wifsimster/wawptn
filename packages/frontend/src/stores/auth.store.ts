import { create } from 'zustand'
import { api } from '@/lib/api'

interface AuthState {
  user: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; isAdmin: boolean } | null
  loading: boolean
  fetchUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    try {
      const user = await api.getMe()
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  logout: async () => {
    await api.logout()
    set({ user: null })
  },
}))
