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

  // Groups
  getGroups: () => request<{ id: string; name: string; role: string; createdAt: string; memberCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null }[]>('/groups'),
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
  getCommonGames: (groupId: string, filter?: string) => request<{
    games: { steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null }[];
    totalMembers: number; threshold: number;
  }>(`/groups/${groupId}/common-games${filter ? `?filter=${filter}` : ''}`),
  syncLibraries: (groupId: string) => request(`/groups/${groupId}/sync`, { method: 'POST' }),

  // Voting
  getVoteSession: (groupId: string) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; createdAt: string } | null;
    games: { steamAppId: number; gameName: string; headerImageUrl: string }[];
    myVotes: { steamAppId: number; vote: boolean }[];
    voterCount: number; totalMembers: number;
  }>(`/groups/${groupId}/vote`),
  createVoteSession: (groupId: string, filter?: string) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; createdAt: string };
    games: { steamAppId: number; gameName: string; headerImageUrl: string }[];
  }>(`/groups/${groupId}/vote`, {
    method: 'POST',
    body: JSON.stringify(filter ? { filter } : {}),
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
