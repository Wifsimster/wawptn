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
  gameName: string
  headerImageUrl: string | null
  syncedAt: string
}

export interface CommonGame {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  ownerCount: number
  totalMembers: number
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
  winningGameName: string | null
  createdAt: string
  closedAt: string | null
}

export interface Vote {
  sessionId: string
  userId: string
  steamAppId: number
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
// Socket.io Events
// ============================================

export interface ServerToClientEvents {
  'vote:cast': (data: { sessionId: string; userId: string; voterCount: number }) => void
  'vote:closed': (data: { sessionId: string; result: VoteResult }) => void
  'member:joined': (data: { groupId: string; user: Pick<User, 'id' | 'displayName' | 'avatarUrl'> }) => void
  'member:left': (data: { groupId: string; userId: string }) => void
  'library:synced': (data: { groupId: string; userId: string; gameCount: number }) => void
  'session:created': (data: { sessionId: string; groupId: string; createdBy: string }) => void
}

export interface ClientToServerEvents {
  'group:join': (groupId: string) => void
  'group:leave': (groupId: string) => void
}
