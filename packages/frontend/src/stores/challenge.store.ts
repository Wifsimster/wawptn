import { create } from 'zustand'
import type { ChallengeProgress } from '@wawptn/types'
import { api } from '@/lib/api'

interface ChallengeState {
  challenges: ChallengeProgress[]
  totalUnlocked: number
  totalChallenges: number
  loading: boolean
  fetchChallenges: () => Promise<void>
}

export const useChallengeStore = create<ChallengeState>((set) => ({
  challenges: [],
  totalUnlocked: 0,
  totalChallenges: 0,
  loading: false,
  fetchChallenges: async () => {
    set({ loading: true })
    try {
      const data = await api.getChallenges()
      set({
        challenges: data.challenges,
        totalUnlocked: data.stats.totalUnlocked,
        totalChallenges: data.stats.totalChallenges,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },
}))
