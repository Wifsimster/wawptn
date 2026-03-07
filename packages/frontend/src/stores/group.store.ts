import { create } from 'zustand'
import { api } from '@/lib/api'

interface GroupState {
  groups: { id: string; name: string; role: string; createdAt: string; memberCount: number; commonGameCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null }[]
  currentGroup: {
    id: string; name: string; createdBy: string; commonGameThreshold: number | null; createdAt: string;
    members: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; role: string; joinedAt: string }[]
  } | null
  loading: boolean
  fetchGroups: () => Promise<void>
  fetchGroup: (id: string) => Promise<void>
  createGroup: (name: string) => Promise<{ id: string; inviteToken: string }>
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
  createGroup: async (name: string) => {
    const result = await api.createGroup(name)
    return { id: result.id, inviteToken: result.inviteToken }
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
