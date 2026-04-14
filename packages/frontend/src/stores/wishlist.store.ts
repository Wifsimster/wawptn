import { create } from 'zustand'
import { api } from '@/lib/api'

/**
 * User's personal game wishlist — a set of steam_app_ids the user has
 * starred so the UI can render "I want to play this soon" state on
 * every game card without a round-trip per card.
 *
 * Implements Sarah #3 from the multi-persona feature meeting.
 *
 * Toggle is optimistic: the local set is updated immediately, then the
 * API call goes out, and we roll back on failure. This matches the
 * "tap the star and it lights up" ergonomic users expect from every
 * other app.
 */
interface WishlistState {
  /** Stable snapshot — callers should not mutate. */
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

    // Optimistic update — replace the set rather than mutating it so
    // Zustand's reference-equality check fires and subscribed components
    // re-render.
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
      // Roll back on failure. We still use a fresh Set rather than
      // mutating to avoid splitting references.
      const rollback = new Set(get().ids)
      if (isInList) rollback.add(steamAppId)
      else rollback.delete(steamAppId)
      set({ ids: rollback })
    }
  },

  has: (steamAppId: number) => get().ids.has(steamAppId),

  clear: () => set({ ids: new Set<number>(), loaded: false }),
}))
