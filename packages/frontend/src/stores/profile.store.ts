import { create } from 'zustand'
import type { PublicUserProfile, UserCompareResult } from '@wawptn/types'
import { api } from '@/lib/api'

/**
 * Profile store — caches `PublicUserProfile` and `UserCompareResult`
 * responses in memory keyed by user id (or sorted pair for compares).
 *
 * Deliberately separate from `useGroupStore`: profiles are cross-group
 * data, and mixing invalidation would make the group store muddy.
 * See issue #142.
 */

interface ProfileState {
  profiles: Record<string, PublicUserProfile>
  compares: Record<string, UserCompareResult>
  loading: Record<string, boolean>
  errors: Record<string, string | null>
  fetchProfile: (userId: string) => Promise<PublicUserProfile | null>
  refreshProfile: (userId: string) => Promise<PublicUserProfile | null>
  fetchCompare: (a: string, b: string) => Promise<UserCompareResult | null>
  clear: () => void
}

const compareKey = (a: string, b: string): string => [a, b].sort().join('::')

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: {},
  compares: {},
  loading: {},
  errors: {},

  fetchProfile: async (userId: string) => {
    const cached = get().profiles[userId]
    if (cached) return cached
    return get().refreshProfile(userId)
  },

  refreshProfile: async (userId: string) => {
    set((state) => ({
      loading: { ...state.loading, [userId]: true },
      errors: { ...state.errors, [userId]: null },
    }))
    try {
      const profile = await api.getPublicProfile(userId)
      set((state) => ({
        profiles: { ...state.profiles, [userId]: profile },
        loading: { ...state.loading, [userId]: false },
      }))
      return profile
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      set((state) => ({
        loading: { ...state.loading, [userId]: false },
        errors: { ...state.errors, [userId]: message },
      }))
      return null
    }
  },

  fetchCompare: async (a: string, b: string) => {
    const key = compareKey(a, b)
    const cached = get().compares[key]
    if (cached) return cached
    set((state) => ({
      loading: { ...state.loading, [key]: true },
      errors: { ...state.errors, [key]: null },
    }))
    try {
      const result = await api.compareProfiles(a, b)
      set((state) => ({
        compares: { ...state.compares, [key]: result },
        loading: { ...state.loading, [key]: false },
      }))
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: message },
      }))
      return null
    }
  },

  clear: () => set({ profiles: {}, compares: {}, loading: {}, errors: {} }),
}))
