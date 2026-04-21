// ============================================
// User
// ============================================

export interface User {
  id: string
  steamId: string
  displayName: string
  avatarUrl: string | null
  profileUrl: string | null
  email: string | null
  libraryVisible: boolean
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

// ============================================
// Group
// ============================================

export interface Group {
  id: string
  name: string
  createdBy: string
  inviteTokenHash: string | null
  inviteExpiresAt: string | null
  inviteUseCount: number
  inviteMaxUses: number
  commonGameThreshold: number | null
  discordGuildId: string | null
  discordChannelId: string | null
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  groupId: string
  userId: string
  role: 'owner' | 'member'
  joinedAt: string
}

export interface GroupWithMembers extends Group {
  members: (GroupMember & { user: Pick<User, 'id' | 'steamId' | 'displayName' | 'avatarUrl'> })[]
}

// ============================================
// Persona (daily bot persona — per group)
// ============================================

/**
 * Lean per-group "persona du jour" projection. The full persona pool lives
 * in the global `personas` table and is shared across all groups — each
 * group gets its own deterministic daily pick from that shared pool via
 * `djb2("${YYYY-MM-DD}:${groupId}")`.
 */
export interface GroupDailyPersona {
  id: string
  name: string
  embedColor: number
  introMessage: string
}

/**
 * Per-group persona settings. All fields are optional overrides — when a
 * value is null/empty, the group falls back to the global `bot.*` defaults
 * stored in `app_settings`. Stored 1:1 with groups in `group_persona_settings`.
 */
export interface GroupPersonaSettings {
  groupId: string
  rotationEnabled: boolean
  disabledPersonas: string[]
  personaOverride: string | null
  overrideExpiresAt: string | null
}

/**
 * Payload accepted by `PATCH /api/groups/:id/persona-settings`. Undefined
 * fields are left untouched; null clears an override.
 */
export interface GroupPersonaSettingsUpdate {
  rotationEnabled?: boolean
  disabledPersonas?: string[]
  personaOverride?: string | null
  overrideExpiresAt?: string | null
}

// ============================================
// Games
// ============================================

export interface UserGame {
  userId: string
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
  platform?: string
  playtimeForever?: number | null
  playtime2weeks?: number | null
  syncedAt: string
}

export interface CommonGame {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
  ownerCount: number
  totalMembers: number
  totalPlaytime?: number | null
  avgPlaytime?: number | null
  isMultiplayer: boolean | null
  isCoop: boolean | null
  genres: { id: string; description: string }[] | null
  metacriticScore: number | null
  type: string | null
  shortDescription: string | null
  platforms: { windows: boolean; mac: boolean; linux: boolean } | null
  recommendationsTotal: number | null
  releaseDate: string | null
  comingSoon: boolean | null
  controllerSupport: string | null
  isFree: boolean | null
  contentDescriptors: { ids: number[]; notes: string | null } | null
}

export interface GameMetadata {
  steamAppId: number
  gameId?: string
  type: string | null
  shortDescription: string | null
  isFree: boolean | null
  categories: { id: number; description: string }[] | null
  genres: { id: string; description: string }[] | null
  metacriticScore: number | null
  platforms: { windows: boolean; mac: boolean; linux: boolean } | null
  recommendationsTotal: number | null
  releaseDate: string | null
  comingSoon: boolean | null
  controllerSupport: string | null
  contentDescriptors: { ids: number[]; notes: string | null } | null
  isMultiplayer: boolean | null
  isCoop: boolean | null
  enrichedAt: string | null
}

// ============================================
// Voting
// ============================================

export type VotingSessionStatus = 'open' | 'closed'

export interface VotingSession {
  id: string
  groupId: string
  status: VotingSessionStatus
  createdBy: string
  winningGameAppId: number | null
  winningGameId: string | null
  winningGameName: string | null
  scheduledAt: string | null
  createdAt: string
  closedAt: string | null
}

export interface Vote {
  sessionId: string
  userId: string
  steamAppId: number
  gameId?: string
  vote: boolean
  createdAt: string
}

export interface VotingSessionWithVotes extends VotingSession {
  votes: Vote[]
  games: CommonGame[]
  voterCount: number
  totalMembers: number
}

export interface VoteResult {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  totalVoters: number
}

// ============================================
// API Responses
// ============================================

export interface ApiError {
  error: string
  message: string
}

export interface SteamLibrarySyncStatus {
  userId: string
  status: 'syncing' | 'synced' | 'failed' | 'private'
  gameCount: number
  lastSyncedAt: string | null
}

// ============================================
// Profile comparison
// ============================================

/**
 * One game row inside a public profile — used by both the single
 * profile view and the two-user comparison view. `playtimeForever`
 * is in minutes, matching Steam's raw value.
 */
export interface PublicProfileGame {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  playtimeForever: number | null
}

/**
 * Public view of another user's profile, scoped to a viewer they
 * share at least one group with. The list of fields that are
 * actually populated depends on the target user's visibility
 * settings — see the backend route for the exact gating rules.
 */
export interface PublicUserProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  /** Total number of games in the target's library (always visible). */
  gameCount: number
  /** Total minutes across the library, only if `visibilityFullLibrary`. */
  totalPlaytimeMinutes: number | null
  /** Games in common with the viewer, always populated. */
  commonGamesWithViewer: PublicProfileGame[]
  /** Full top-N library, only populated if `visibilityFullLibrary`. */
  topGames: PublicProfileGame[] | null
  /** Last time we successfully refreshed their library from Steam. */
  lastSyncedAt: string | null
  /** True if the target has opted in to sharing their full library. */
  visibilityFullLibrary: boolean
  /** True if the target has opted in to sharing last-played timestamps. */
  visibilityLastPlayed: boolean
}

/**
 * Side-by-side comparison of two users, scoped to what the viewer
 * is authorized to see. Both `a` and `b` must be co-members of at
 * least one group with the viewer.
 */
export interface UserCompareResult {
  a: PublicUserProfile
  b: PublicUserProfile
  commonGames: Array<{
    steamAppId: number
    gameName: string
    headerImageUrl: string | null
    playtimeA: number | null
    playtimeB: number | null
  }>
  onlyAGames: PublicProfileGame[]
  onlyBGames: PublicProfileGame[]
  overlapRatio: number
}

/** Self-settings payload for the visibility toggles. */
export interface ProfileVisibilitySettings {
  visibilityFullLibrary: boolean
  visibilityLastPlayed: boolean
}

// ============================================
// Discord
// ============================================

export interface DiscordLink {
  userId: string
  discordId: string
  discordUsername: string
  linkedAt: string
}

export interface DiscordGroupConfig {
  discordChannelId: string | null
  discordGuildId: string | null
  discordWebhookUrl: string | null
}

// ── Bot HTTP contract ──────────────────────────────────────────────────
// The backend talks to the Discord bot process over HTTP so the bot
// (which holds the persistent Gateway connection) can send, edit, and
// close interactive vote messages. These shapes are the wire format.

/** Per-game vote tally used by every live/close message payload. */
export interface DiscordVoteTally {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  noCount: number
}

/** Vote summary attached to create/update payloads. */
export interface DiscordVoteSummary {
  voterCount: number
  totalParticipants: number
  tallies: DiscordVoteTally[]
}

export interface DiscordSessionCreatedRequest {
  sessionId: string
  groupId: string
  groupName: string
  channelId: string
  creatorName: string
  games: Array<{
    steamAppId: number
    gameName: string
    headerImageUrl: string | null
  }>
  summary: DiscordVoteSummary
}

export interface DiscordSessionCreatedResponse {
  messageId: string
}

export interface DiscordSessionUpdateRequest {
  sessionId: string
  groupName: string
  channelId: string
  messageId: string
  creatorName: string
  games: Array<{
    steamAppId: number
    gameName: string
    headerImageUrl: string | null
  }>
  summary: DiscordVoteSummary
}

export interface DiscordSessionClosedRequest {
  sessionId: string
  groupName: string
  channelId: string
  messageId: string
  result: VoteResult
  summary: DiscordVoteSummary
}

// ============================================
// Challenges
// ============================================

export interface ChallengeProgress {
  id: string
  category: string
  title: string
  description: string
  icon: string
  tier: number
  threshold: number
  progress: number
  percentage: number
  unlockedAt: string | null
}

// ============================================
// Notifications
// ============================================

export type NotificationType =
  | 'vote_opened'
  | 'vote_closed'
  | 'vote_reminder'
  | 'admin_broadcast'
  | 'challenge_unlocked'
  | 'premium_granted'
  | 'premium_revoked'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  groupId: string | null
  metadata: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

// ============================================
// Socket.io Events
// ============================================

export interface ServerToClientEvents {
  'vote:cast': (data: { sessionId: string; userId: string; voterCount: number; totalParticipants?: number }) => void
  'vote:closed': (data: { sessionId: string; result: VoteResult }) => void
  'member:joined': (data: { groupId: string; user: Pick<User, 'id' | 'displayName' | 'avatarUrl'> }) => void
  'member:left': (data: { groupId: string; userId: string }) => void
  'member:kicked': (data: { groupId: string; userId: string }) => void
  'group:deleted': (data: { groupId: string; groupName: string }) => void
  'group:renamed': (data: { groupId: string; newName: string }) => void
  'library:synced': (data: { groupId: string; userId: string; gameCount: number }) => void
  'session:created': (data: { sessionId: string; groupId: string; createdBy: string; participantIds?: string[]; scheduledAt?: string }) => void
  'group:presence': (data: { onlineUserIds: string[] }) => void
  'member:online': (data: { groupId: string; userId: string }) => void
  'member:offline': (data: { groupId: string; userId: string }) => void
  'notification:new': (data: Notification) => void
  'challenge:unlocked': (data: { userId: string; challengeId: string; title: string; icon: string; tier: number }) => void
  'persona:changed': (data: { groupId: string; persona: GroupDailyPersona; date: string; reason: 'rotation' | 'override' | 'settings' }) => void
}

export interface ClientToServerEvents {
  'group:join': (groupId: string) => void
  'group:leave': (groupId: string) => void
}

// ============================================
// Invite Preview
// ============================================

export interface InvitePreviewGame {
  gameName: string
  headerImageUrl: string | null
}

export interface InvitePreview {
  isValid: boolean
  groupName: string
  memberCount: number
  memberAvatars: string[]
  topGames: InvitePreviewGame[]
  recentWinner: InvitePreviewGame | null
}
