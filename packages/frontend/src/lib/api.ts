const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `Request failed: ${res.status}`)
  }

  return res.json()
}

// Auth
export const api = {
  getMe: () => request<{ id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean }>('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getProfile: () => request<{
    id: string; steamId: string; displayName: string; avatarUrl: string; profileUrl: string | null;
    libraryVisible: boolean; createdAt: string;
    platforms: {
      id: string; name: string; connected: boolean; comingSoon?: boolean;
      accountId?: string | null; gameCount?: number; lastSyncedAt?: string | null; profileUrl?: string | null;
    }[];
  }>('/auth/profile'),
  syncProfile: () => request<{ ok: boolean }>('/auth/profile/sync', { method: 'POST' }),

  // Groups
  getGroups: () => request<{ id: string; name: string; role: string; createdAt: string; memberCount: number; commonGameCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null }[]>('/groups'),
  getGroup: (id: string) => request<{
    id: string; name: string; createdBy: string; commonGameThreshold: number | null; createdAt: string;
    members: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; role: string; joinedAt: string }[]
  }>(`/groups/${id}`),
  createGroup: (name: string) => request<{ id: string; name: string; inviteToken: string; inviteExpiresAt: string }>('/groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  joinGroup: (token: string) => request<{ id: string; name: string; alreadyMember: boolean }>('/groups/join', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }),
  generateInvite: (groupId: string) => request<{ inviteToken: string; inviteExpiresAt: string }>(`/groups/${groupId}/invite`, {
    method: 'POST',
  }),
  leaveGroup: (groupId: string, userId: string) => request(`/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  }),
  deleteGroup: (groupId: string) => request(`/groups/${groupId}`, {
    method: 'DELETE',
  }),
  getCommonGames: (groupId: string, filter?: string) => request<{
    games: { steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null; genres: { id: string; description: string }[] | null; metacriticScore: number | null; type: string | null; shortDescription: string | null; platforms: { windows: boolean; mac: boolean; linux: boolean } | null; recommendationsTotal: number | null; releaseDate: string | null; comingSoon: boolean | null; controllerSupport: string | null; isFree: boolean | null; contentDescriptors: { ids: number[]; notes: string | null } | null }[];
    totalMembers: number; threshold: number;
  }>(`/groups/${groupId}/common-games${filter ? `?filter=${filter}` : ''}`),
  syncLibraries: (groupId: string) => request(`/groups/${groupId}/sync`, { method: 'POST' }),
  previewCommonGames: (groupId: string, memberIds: string[], filter?: string) =>
    request<{ gameCount: number; totalMembers: number }>(`/groups/${groupId}/common-games/preview`, {
      method: 'POST',
      body: JSON.stringify({ memberIds, filter }),
    }),

  // Voting
  getVoteSession: (groupId: string) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; scheduledAt: string | null; createdAt: string } | null;
    games: { steamAppId: number; gameName: string; headerImageUrl: string }[];
    myVotes: { steamAppId: number; vote: boolean }[];
    voterCount: number; totalMembers: number; isParticipant: boolean; participantIds: string[];
  }>(`/groups/${groupId}/vote`),
  createVoteSession: (groupId: string, participantIds: string[], filter?: string, scheduledAt?: string) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; scheduledAt: string | null; createdAt: string };
    games: { steamAppId: number; gameName: string; headerImageUrl: string }[];
  }>(`/groups/${groupId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ participantIds, ...(filter ? { filter } : {}), ...(scheduledAt ? { scheduledAt } : {}) }),
  }),
  castVote: (groupId: string, sessionId: string, steamAppId: number, vote: boolean) =>
    request(`/groups/${groupId}/vote/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ steamAppId, vote }),
    }),
  closeVote: (groupId: string, sessionId: string) =>
    request<{ result: { steamAppId: number; gameName: string; headerImageUrl: string | null; yesCount: number; totalVoters: number } }>(
      `/groups/${groupId}/vote/${sessionId}/close`, { method: 'POST' }
    ),
  getVoteHistory: (groupId: string) => request<{ id: string; winningGameAppId: number; winningGameName: string; closedAt: string }[]>(
    `/groups/${groupId}/vote/history`
  ),
}
