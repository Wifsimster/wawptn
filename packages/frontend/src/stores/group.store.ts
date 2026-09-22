import { create } from 'zustand'
import { api } from '@/lib/api'

interface DailyPersona { id: string; name: string; embedColor: number; introMessage: string }

interface GroupState {
  groups: { id: string; name: string; role: string; createdAt: string; memberCount: number; commonGameCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null; activeVoteSession: { id: string; scheduledAt: string | null } | null; todayPersona: DailyPersona | null; discordGuildId: string | null; discordChannelId: string | null; discordGuildName: string | null; discordChannelName: string | null }[]
  currentGroup: {
    id: string; name: string; createdBy: string; commonGameThreshold: number | null; createdAt: string;
    autoVoteSchedule: string | null; autoVoteDurationMinutes: number;
    releasesDigestEnabled: boolean; releasesDigestSchedule: string; releasesDigestCoopOnly: boolean;
    newGameSpotlightEnabled: boolean;
    discordGuildId: string | null; discordChannelId: string | null;
    discordGuildName: string | null; discordChannelName: string | null;
    members: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; role: string; joinedAt: string; notificationsEnabled: boolean }[];
    todayPersona: DailyPersona | null
  } | null
  loading: boolean
  fetchGroups: () => Promise<void>
  fetchGroup: (id: string) => Promise<void>
  createGroup: (input: { name: string }) => Promise<{ id: string; inviteToken: string }>
  renameGroup: (groupId: string, name: string) => Promise<void>
  joinGroup: (token: string) => Promise<{
    id: string
    name: string
    activeVoteSession: { id: string; scheduledAt: string | null } | null
  }>
  leaveGroup: (groupId: string, userId: string) => Promise<void>
  deleteGroup: (groupId: string) => Promise<void>
}

// Id of the most recent fetchGroup call, so a slow response for a group the
// user already navigated away from can't overwrite the newer one.
let latestGroupRequestId: string | null = null

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  currentGroup: null,
  loading: false,
  fetchGroups: async () => {
    set({ loading: true })
    try {
      const groups = await api.getGroups()
      set({ groups })
    } finally {
      set({ loading: false })
    }
  },
  fetchGroup: async (id: string) => {
    latestGroupRequestId = id
    // Drop a different group's data right away: consumers (vote setup
    // dialog, startVote deep link) must never act on the previous group's
    // members under the new group's URL. A refetch of the same group keeps
    // its data on screen.
    if (get().currentGroup?.id !== id) {
      set({ currentGroup: null, loading: true })
    } else {
      set({ loading: true })
    }
    try {
      const group = await api.getGroup(id)
      if (latestGroupRequestId === id) set({ currentGroup: group })
    } finally {
      if (latestGroupRequestId === id) set({ loading: false })
    }
  },
  createGroup: async (input) => {
    const result = await api.createGroup(input)
    return { id: result.id, inviteToken: result.inviteToken }
  },
  renameGroup: async (groupId: string, name: string) => {
    const result = await api.renameGroup(groupId, name)
    set((state) => ({
      groups: state.groups.map((g) => g.id === groupId ? { ...g, name: result.name } : g),
      currentGroup: state.currentGroup?.id === groupId ? { ...state.currentGroup, name: result.name } : state.currentGroup,
    }))
  },
  joinGroup: async (token: string) => {
    const result = await api.joinGroup(token)
    return { id: result.id, name: result.name, activeVoteSession: result.activeVoteSession }
  },
  leaveGroup: async (groupId: string, userId: string) => {
    await api.leaveGroup(groupId, userId)
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      currentGroup: state.currentGroup?.id === groupId ? null : state.currentGroup,
    }))
  },
  deleteGroup: async (groupId: string) => {
    await api.deleteGroup(groupId)
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      currentGroup: state.currentGroup?.id === groupId ? null : state.currentGroup,
    }))
  },
}))
