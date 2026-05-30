import type { CommonGame } from '@wawptn/types'

export type VoteHistoryEntry = {
  id: string
  winningGameAppId: number
  winningGameId?: string
  winningGameName: string
  closedAt: string
  createdBy: string
}

export type ActiveVoteSession = { id: string; scheduledAt: string | null }

export type TodayPersona = { id: string; name: string; embedColor: number; introMessage: string }

// Server-driven group data that the mount effect and the live socket events
// keep in sync. Bundling it behind one reducer means a single dispatch can
// update several related fields at once (e.g. a finished vote both clears the
// active session and refreshes history) instead of firing a cascade of
// independent setState calls inside the effect.
export interface GroupDataState {
  games: CommonGame[]
  gamesLoading: boolean
  voteHistory: VoteHistoryEntry[]
  voteHistoryTruncated: boolean
  activeVoteSession: ActiveVoteSession | null
  todayPersona: TodayPersona | null
  onlineUserIds: string[]
}

export const initialGroupData: GroupDataState = {
  games: [],
  gamesLoading: true,
  voteHistory: [],
  voteHistoryTruncated: false,
  activeVoteSession: null,
  todayPersona: null,
  onlineUserIds: [],
}

export type GroupDataAction =
  | { type: 'gamesLoading' }
  | { type: 'gamesLoaded'; games: CommonGame[] }
  | { type: 'gamesLoadFailed' }
  | { type: 'voteHistory'; entries: VoteHistoryEntry[]; truncated: boolean }
  | { type: 'removeHistoryEntry'; sessionId: string }
  | { type: 'activeVoteSession'; session: ActiveVoteSession | null }
  | { type: 'todayPersona'; persona: TodayPersona | null }
  | { type: 'presence'; onlineUserIds: string[] }
  | { type: 'memberOnline'; userId: string }
  | { type: 'memberOffline'; userId: string }

export function groupDataReducer(state: GroupDataState, action: GroupDataAction): GroupDataState {
  switch (action.type) {
    case 'gamesLoading':
      return { ...state, gamesLoading: true }
    case 'gamesLoaded':
      return { ...state, games: action.games, gamesLoading: false }
    case 'gamesLoadFailed':
      return { ...state, gamesLoading: false }
    case 'voteHistory':
      return { ...state, voteHistory: action.entries, voteHistoryTruncated: action.truncated }
    case 'removeHistoryEntry':
      return { ...state, voteHistory: state.voteHistory.filter((h) => h.id !== action.sessionId) }
    case 'activeVoteSession':
      return { ...state, activeVoteSession: action.session }
    case 'todayPersona':
      return { ...state, todayPersona: action.persona }
    case 'presence':
      return { ...state, onlineUserIds: action.onlineUserIds }
    case 'memberOnline':
      return state.onlineUserIds.includes(action.userId)
        ? state
        : { ...state, onlineUserIds: [...state.onlineUserIds, action.userId] }
    case 'memberOffline':
      return { ...state, onlineUserIds: state.onlineUserIds.filter((uid) => uid !== action.userId) }
  }
}
