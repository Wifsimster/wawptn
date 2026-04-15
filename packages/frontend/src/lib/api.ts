const API_BASE = '/api'

export class ApiError extends Error {
  code: string
  status: number
  /** Any extra fields the server included in the JSON error body (e.g.
   *  the `inviteUrl` returned with a `bot_not_in_guild` response). */
  details: Record<string, unknown>
  constructor(message: string, code: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

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
    const error = await res.json().catch(() => ({ message: res.statusText, error: 'unknown' })) as Record<string, unknown>
    throw new ApiError(
      (typeof error['message'] === 'string' ? error['message'] : undefined) || `Request failed: ${res.status}`,
      (typeof error['error'] === 'string' ? error['error'] : undefined) || 'unknown',
      res.status,
      error,
    )
  }

  return res.json()
}

// Auth
export const api = {
  getMe: () => request<{ id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; isAdmin: boolean }>('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getProfile: () => request<{
    id: string; steamId: string; displayName: string; avatarUrl: string; profileUrl: string | null;
    libraryVisible: boolean; createdAt: string;
    platforms: {
      id: string; name: string; connected: boolean; comingSoon?: boolean; linkable?: boolean; needsRelink?: boolean;
      accountId?: string | null; gameCount?: number; lastSyncedAt?: string | null; profileUrl?: string | null;
    }[];
    discord:
      | { linked: true; discordId: string; discordUsername: string; linkedAt: string }
      | { linked: false };
  }>('/auth/profile'),
  syncProfile: () => request<{ ok: boolean }>('/auth/profile/sync', { method: 'POST' }),
  syncPlatform: (platformId: string) => request<{ ok: boolean }>(`/auth/${platformId}/sync`, { method: 'POST' }),
  unlinkPlatform: (providerId: string) => {
    if (providerId === 'epic' || providerId === 'gog') {
      return request<{ ok: boolean }>(`/auth/${providerId}/unlink`, { method: 'POST' })
    }
    return request<{ ok: boolean }>(`/auth/${providerId}/link`, { method: 'DELETE' })
  },

  // Discord
  confirmDiscordLink: (code: string) => request<{ ok: boolean; discordUsername: string }>('/discord/link/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }),
  unlinkDiscord: () => request<{ ok: boolean; wasLinked: boolean }>('/discord/link', {
    method: 'DELETE',
  }),

  // Invite preview (public, no auth — mounted at /invite, not /api)
  getInvitePreview: async (token: string): Promise<import('@wawptn/types').InvitePreview> => {
    const res = await fetch(`/invite/${token}/preview`)
    if (!res.ok) throw new Error('Failed to load invite preview')
    return res.json()
  },

  // Groups
  getGroups: () => request<{ id: string; name: string; role: string; createdAt: string; memberCount: number; commonGameCount: number; lastSession: { gameName: string; gameAppId: number; closedAt: string } | null; todayPersona: { id: string; name: string; embedColor: number; introMessage: string } | null; discordGuildId: string | null; discordChannelId: string | null }[]>('/groups'),
  getGroup: (id: string) => request<{
    id: string; name: string; createdBy: string; commonGameThreshold: number | null; createdAt: string;
    autoVoteSchedule: string | null; autoVoteDurationMinutes: number;
    discordGuildId: string | null; discordChannelId: string | null;
    members: { id: string; steamId: string; displayName: string; avatarUrl: string; libraryVisible: boolean; role: string; joinedAt: string; notificationsEnabled: boolean }[];
    todayPersona: { id: string; name: string; embedColor: number; introMessage: string } | null;
  }>(`/groups/${id}`),
  createGroup: (input: { name: string; discordGuildId?: string | null; discordChannelId?: string | null }) =>
    request<{ id: string; name: string; inviteToken: string; inviteExpiresAt: string; discordGuildId: string | null; discordChannelId: string | null }>('/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Discord OAuth2 picker — powers the "bind a Discord channel at group
  // creation" flow. The authorize URL is opened in a popup; guilds and
  // channels are fetched after the callback page has closed itself.
  getDiscordOAuthAuthorizeUrl: () => request<{ url: string }>('/discord/oauth/authorize'),
  listDiscordGuilds: () =>
    request<{ guilds: { id: string; name: string; iconUrl: string | null; canManage: boolean }[] }>(
      '/discord/guilds',
    ),
  listDiscordChannels: (guildId: string) =>
    request<{ channels: { id: string; name: string; type: number }[] }>(
      `/discord/guilds/${guildId}/channels`,
    ),
  clearDiscordOAuthSession: () => request<{ ok: boolean }>('/discord/oauth/session', { method: 'DELETE' }),
  // Unified owner-only group update. Accepts any subset of `name` and
  // the Discord binding pair. Used both for rename and for the
  // "link a Discord channel" banner on the group detail page.
  updateGroup: (
    groupId: string,
    patch: { name?: string; discordGuildId?: string | null; discordChannelId?: string | null },
  ) => request<{ id: string; name: string; discordGuildId: string | null; discordChannelId: string | null }>(
    `/groups/${groupId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  ),
  renameGroup: (groupId: string, name: string) => request<{ id: string; name: string; discordGuildId: string | null; discordChannelId: string | null }>(`/groups/${groupId}`, {
    method: 'PATCH',
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
    games: { steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null; genres: { id: string; description: string }[] | null; metacriticScore: number | null; type: string | null; shortDescription: string | null; platforms: { windows: boolean; mac: boolean; linux: boolean } | null; recommendationsTotal: number | null; releaseDate: string | null; comingSoon: boolean | null; controllerSupport: string | null; isFree: boolean | null; contentDescriptors: { ids: number[]; notes: string | null } | null }[];
    totalMembers: number; threshold: number;
  }>(`/groups/${groupId}/common-games${filter ? `?filter=${filter}` : ''}`),
  getGroupStats: (groupId: string) => request<{
    totalSessions: number;
    totalVotes: number;
    topGames: { gameName: string; steamAppId: number; winCount: number; totalNominations: number }[];
    memberParticipation: { userId: string; displayName: string; avatarUrl: string; voteCount: number; sessionsParticipated: number }[];
    recentWinners: { gameName: string; steamAppId: number; closedAt: string }[];
  }>(`/groups/${groupId}/stats`),
  toggleNotifications: (groupId: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/groups/${groupId}/notifications`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  updateAutoVote: (groupId: string, schedule: string | null, durationMinutes?: number) =>
    request<{ ok: boolean }>(`/groups/${groupId}/auto-vote`, {
      method: 'PATCH',
      body: JSON.stringify({ schedule, ...(durationMinutes !== undefined ? { durationMinutes } : {}) }),
    }),
  syncLibraries: (groupId: string) => request(`/groups/${groupId}/sync`, { method: 'POST' }),
  getRecommendations: (groupId: string) => request<{
    recommendations: { gameName: string; steamAppId: number; headerImageUrl: string; reason: string }[];
  }>(`/groups/${groupId}/recommendations`),
  previewCommonGames: (groupId: string, memberIds: string[], filter?: string, filters?: { multiplayer?: boolean; coop?: boolean; free?: boolean }) =>
    request<{ gameCount: number; totalMembers: number }>(`/groups/${groupId}/common-games/preview`, {
      method: 'POST',
      body: JSON.stringify({ memberIds, ...(filter ? { filter } : {}), ...(filters ? { filters } : {}) }),
    }),

  // Voting
  getVoteSession: (groupId: string) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; scheduledAt: string | null; createdAt: string } | null;
    games: {
      steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string;
      shortDescription: string | null; genres: { id: string; description: string }[] | null;
      metacriticScore: number | null; platforms: { windows: boolean; mac: boolean; linux: boolean } | null;
      releaseDate: string | null; controllerSupport: string | null; isFree: boolean | null; type: string | null;
    }[];
    myVotes: { steamAppId: number; gameId?: string; vote: boolean }[];
    voterCount: number; totalMembers: number; isParticipant: boolean; participantIds: string[];
    votedUserIds: string[];
  }>(`/groups/${groupId}/vote`),
  createVoteSession: (groupId: string, participantIds: string[], filter?: string, scheduledAt?: string, filters?: { multiplayer?: boolean; coop?: boolean; free?: boolean }) => request<{
    session: { id: string; groupId: string; status: string; createdBy: string; scheduledAt: string | null; createdAt: string };
    games: { steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string }[];
  }>(`/groups/${groupId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ participantIds, ...(filter ? { filter } : {}), ...(filters ? { filters } : {}), ...(scheduledAt ? { scheduledAt } : {}) }),
  }),
  castVote: (groupId: string, sessionId: string, steamAppId: number, vote: boolean) =>
    request(`/groups/${groupId}/vote/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ steamAppId, vote }),
    }),
  castVotes: (groupId: string, sessionId: string, votes: { steamAppId: number; vote: boolean }[]) =>
    request(`/groups/${groupId}/vote/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ votes }),
    }),
  closeVote: (groupId: string, sessionId: string) =>
    request<{ result: { steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string | null; yesCount: number; totalVoters: number } }>(
      `/groups/${groupId}/vote/${sessionId}/close`, { method: 'POST' }
    ),
  getVoteHistory: (groupId: string) => request<{
    data: { id: string; winningGameAppId: number; winningGameId?: string; winningGameName: string; closedAt: string; createdBy: string }[]
    total: number
    limit: number
    offset: number
    freeLimitApplied: boolean
    freeLimit: number
  }>(
    `/groups/${groupId}/vote/history`
  ),
  rematchVote: (groupId: string, sessionId: string) =>
    request<{
      session: { id: string; groupId: string; status: string; createdBy: string; scheduledAt: string | null; createdAt: string };
      games: { steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string }[];
    }>(`/groups/${groupId}/vote/${sessionId}/rematch`, { method: 'POST' }),
  deleteVoteSession: (groupId: string, sessionId: string) =>
    request<{ ok: boolean }>(`/groups/${groupId}/vote/${sessionId}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () => request<import('@wawptn/types').Notification[]>('/notifications'),
  getNotificationCount: () => request<{ count: number }>('/notifications/count'),
  markNotificationRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request<{ ok: boolean; count: number }>('/notifications/read-all', { method: 'POST' }),
  broadcastNotification: (title: string, body?: string, groupId?: string) =>
    request<{ ok: boolean; notificationId: string; recipientCount: number }>('/admin/notifications', {
      method: 'POST',
      body: JSON.stringify({ title, body, groupId }),
    }),

  // Challenges
  getChallenges: () => request<{
    challenges: import('@wawptn/types').ChallengeProgress[];
    stats: { totalUnlocked: number; totalChallenges: number };
  }>('/challenges/me'),

  // User profile comparison (issue #142)
  getPublicProfile: (userId: string) =>
    request<import('@wawptn/types').PublicUserProfile>(`/users/${userId}/profile`),
  compareProfiles: (a: string, b: string) =>
    request<import('@wawptn/types').UserCompareResult>(`/users/compare?a=${a}&b=${b}`),
  getVisibility: () =>
    request<import('@wawptn/types').ProfileVisibilitySettings>('/users/me/visibility'),
  updateVisibility: (patch: Partial<import('@wawptn/types').ProfileVisibilitySettings>) =>
    request<import('@wawptn/types').ProfileVisibilitySettings>('/users/me/visibility', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Persona — the app-wide endpoint is the global fallback (login page).
  // Prefer `getGroupPersona(groupId)` for the per-group "persona du jour".
  getCurrentPersona: () => request<{ id: string; name: string; embedColor: number; introMessage: string }>('/persona/current'),
  getGroupPersona: (groupId: string) =>
    request<{ persona: { id: string; name: string; embedColor: number; introMessage: string }; date: string }>(`/groups/${groupId}/persona/current`),
  getGroupPersonaSettings: (groupId: string) =>
    request<import('@wawptn/types').GroupPersonaSettings>(`/groups/${groupId}/persona-settings`),
  updateGroupPersonaSettings: (
    groupId: string,
    patch: import('@wawptn/types').GroupPersonaSettingsUpdate,
  ) =>
    request<
      import('@wawptn/types').GroupPersonaSettings & {
        todayPersona: { id: string; name: string; embedColor: number; introMessage: string } | null
      }
    >(`/groups/${groupId}/persona-settings`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Admin
  getAdminBotSettings: () => request<Record<string, unknown>>('/admin/bot-settings'),
  updateAdminBotSettings: (settings: Record<string, unknown>) =>
    request<{ ok: boolean }>('/admin/bot-settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  // Wishlist — Sarah #3
  getWishlist: () => request<{ data: { steamAppId: number; createdAt: string }[] }>('/auth/me/wishlist'),
  addToWishlist: (steamAppId: number) =>
    request<{ ok: true }>('/auth/me/wishlist', {
      method: 'POST',
      body: JSON.stringify({ steamAppId }),
    }),
  removeFromWishlist: (steamAppId: number) =>
    request<{ ok: true }>(`/auth/me/wishlist/${steamAppId}`, { method: 'DELETE' }),

  getAdminStats: () => request<{ users: number; admins: number; groups: number; votingSessions: number }>('/admin/stats'),
  getAdminHealth: () => request<{
    timestamp: string;
    database: { status: 'up' | 'down'; latencyMs: number | null };
    integrations: {
      steam: { state: 'open' | 'closed'; consecutiveFailures: number; circuitOpenUntil: string | null; cacheSize: number };
      epic: { state: 'open' | 'closed'; consecutiveFailures: number; circuitOpenUntil: string | null; cacheSize: number; enabled: boolean };
      gog: { state: 'open' | 'closed'; consecutiveFailures: number; circuitOpenUntil: string | null; cacheSize: number; enabled: boolean };
    };
  }>('/admin/health'),
  getAdminUsers: (params?: { limit?: number; offset?: number; q?: string }) => {
    const search = new URLSearchParams()
    if (params?.limit !== undefined) search.set('limit', String(params.limit))
    if (params?.offset !== undefined) search.set('offset', String(params.offset))
    if (params?.q) search.set('q', params.q)
    const qs = search.toString()
    return request<{
      data: {
        id: string; steamId: string; displayName: string; avatarUrl: string;
        isAdmin: boolean; isPremium: boolean; adminGrantedPremium: boolean;
        createdAt: string;
      }[]
      total: number
      limit: number
      offset: number
    }>(`/admin/users${qs ? `?${qs}` : ''}`)
  },
  setAdminUserRole: (userId: string, isAdmin: boolean) =>
    request<{ ok: boolean }>(`/admin/users/${userId}/admin`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    }),
  setAdminUserPremium: (userId: string, isPremium: boolean) =>
    request<{ ok: boolean }>(`/admin/users/${userId}/premium`, {
      method: 'PATCH',
      body: JSON.stringify({ isPremium }),
    }),

  // Subscription
  getSubscription: () => request<{ tier: 'free' | 'premium'; status: 'active' | 'past_due' | 'canceled' | 'inactive'; currentPeriodEnd: string | null }>('/subscription/me'),
  createCheckout: () => request<{ url: string }>('/subscription/checkout', { method: 'POST' }),
  createPortal: () => request<{ url: string }>('/subscription/portal', { method: 'POST' }),

  // Personas
  getAdminPersonas: () => request<{
    id: string; name: string; systemPromptOverlay: string;
    fridayMessages: string[]; weekdayMessages: string[]; backOnlineMessages: string[];
    emptyMentionReply: string; introMessage: string; embedColor: number;
    isActive: boolean; isDefault: boolean; createdAt: string; updatedAt: string;
  }[]>('/admin/personas'),
  createAdminPersona: (persona: {
    id: string; name: string; systemPromptOverlay: string;
    fridayMessages: string[]; weekdayMessages: string[]; backOnlineMessages: string[];
    emptyMentionReply: string; introMessage: string; embedColor: number;
  }) => request<{ ok: boolean; id: string }>('/admin/personas', {
    method: 'POST',
    body: JSON.stringify(persona),
  }),
  updateAdminPersona: (id: string, updates: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/admin/personas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteAdminPersona: (id: string) =>
    request<{ ok: boolean }>(`/admin/personas/${id}`, {
      method: 'DELETE',
    }),
  toggleAdminPersona: (id: string) =>
    request<{ ok: boolean; isActive: boolean }>(`/admin/personas/${id}/toggle`, {
      method: 'PATCH',
    }),
}
