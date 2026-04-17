import { create } from 'zustand'
import { api } from '@/lib/api'

interface DailyPersona { id: string; name: string; embedColor: number; introMessage: string }

interface GroupState {
  groups: { id: string; name: string; role: string; createdAt: string; memberCount: number; commonGameCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null; todayPersona: DailyPersona | null; discordGuildId: string | null; discordChannelId: string | null; discordGuildName: string | null; discordChannelName: string | null }[]
  currentGroup: {
    id: string; name: string; createdBy: string; commonGameThreshold: number | null; createdAt: string;
    autoVoteSchedule: string | null; autoVoteDurationMinutes: number;
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
  joinGroup: (token: string) => Promise<{ id: string; name: string }>
  leaveGroup: (groupId: string, userId: string) => Promise<void>
  deleteGroup: (groupId: string) => Promise<void>
}

export const useGroupStore = create<GroupState>((set) => ({
  groups: [],
  currentGroup: null,
  loading: false,
  fetchGroups: async () => {
    set({ loading: true })
    const groups = await api.getGroups()
    set({ groups, loading: false })
  },
  fetchGroup: async (id: string) => {
    set({ loading: true })
    const group = await api.getGroup(id)
    set({ currentGroup: group, loading: false })
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
    return { id: result.id, name: result.name }
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
