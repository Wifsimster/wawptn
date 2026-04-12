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

export type NotificationType = 'vote_opened' | 'vote_closed' | 'vote_reminder' | 'admin_broadcast' | 'challenge_unlocked'

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
}

export interface ClientToServerEvents {
  'group:join': (groupId: string) => void
  'group:leave': (groupId: string) => void
}
