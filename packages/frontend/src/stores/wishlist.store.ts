import { create } from 'zustand'
import { api } from '@/lib/api'

interface WishlistState {
  ids: Set<number>
  loaded: boolean
  loading: boolean
  fetch: () => Promise<void>
  toggle: (steamAppId: number) => Promise<void>
  has: (steamAppId: number) => boolean
  clear: () => void
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  ids: new Set<number>(),
  loaded: false,
  loading: false,

  fetch: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const { data } = await api.getWishlist()
      set({ ids: new Set(data.map((r) => r.steamAppId)), loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  toggle: async (steamAppId: number) => {
    const current = get().ids
    const isInList = current.has(steamAppId)

    const next = new Set(current)
    if (isInList) next.delete(steamAppId)
    else next.add(steamAppId)
    set({ ids: next })

    try {
      if (isInList) {
        await api.removeFromWishlist(steamAppId)
      } else {
        await api.addToWishlist(steamAppId)
      }
    } catch {
      const rollback = new Set(get().ids)
      if (isInList) rollback.add(steamAppId)
      else rollback.delete(steamAppId)
      set({ ids: rollback })
    }
  },

  has: (steamAppId: number) => get().ids.has(steamAppId),

  clear: () => set({ ids: new Set<number>(), loaded: false }),
}))
