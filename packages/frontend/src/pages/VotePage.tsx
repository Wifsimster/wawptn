import { useEffect, useState, useCallback, useMemo, useRef, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Vote, CircleOff } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { EmptyState } from '@/components/empty-state'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ResultScreen } from './vote/result-screen'
import { WaitingScreen } from './vote/waiting-screen'
import { GameSelection } from './vote/game-selection'
import type { Game, VoteResult, SessionMeta } from './vote/types'

// Consolidated voting-session state. These fields all describe one cohesive
// concern, the lifecycle of the current voting session, and change together
// (initial load, socket events, close, rematch). Grouping them into a reducer
// lets a single dispatch replace what used to be many cascading setState calls.
interface VoteState {
  session: SessionMeta | null
  games: Game[]
  selectedGames: Set<number>
  voterCount: number
  totalMembers: number
  result: VoteResult | null
  hasVoted: boolean
  isParticipant: boolean
  noSession: boolean
  participantIds: string[]
  votedUserIds: Set<string>
}

type VoteAction =
  | { type: 'noSession' }
  | {
      type: 'loaded'
      session: SessionMeta
      games: Game[]
      voterCount: number
      totalMembers: number
      isParticipant: boolean
      participantIds: string[]
      votedUserIds: Set<string>
      hasVoted: boolean
      selectedGames: Set<number>
    }
  | { type: 'voteCast'; voterCount: number; totalMembers?: number; userId?: string }
  | { type: 'closed'; result: VoteResult }
  | { type: 'toggleGame'; steamAppId: number }
  | { type: 'submitted' }
  | {
      type: 'rematch'
      session: SessionMeta
      games: Game[]
    }

const initialVoteState: VoteState = {
  session: null,
  games: [],
  selectedGames: new Set(),
  voterCount: 0,
  totalMembers: 0,
  result: null,
  hasVoted: false,
  isParticipant: true,
  noSession: false,
  participantIds: [],
  votedUserIds: new Set(),
}

function voteReducer(state: VoteState, action: VoteAction): VoteState {
  switch (action.type) {
    case 'noSession':
      return { ...state, noSession: true }
    case 'loaded':
      return {
        ...state,
        session: action.session,
        games: action.games,
        voterCount: action.voterCount,
        totalMembers: action.totalMembers,
        isParticipant: action.isParticipant,
        participantIds: action.participantIds,
        votedUserIds: action.votedUserIds,
        hasVoted: action.hasVoted,
        selectedGames: action.selectedGames,
      }
    case 'voteCast': {
      const next: VoteState = {
        ...state,
        voterCount: action.voterCount,
        totalMembers: action.totalMembers ?? state.totalMembers,
      }
      if (typeof action.userId === 'string' && !state.votedUserIds.has(action.userId)) {
        const votedUserIds = new Set(state.votedUserIds)
        votedUserIds.add(action.userId)
        next.votedUserIds = votedUserIds
      }
      return next
    }
    case 'closed':
      return { ...state, result: action.result }
    case 'toggleGame': {
      const selectedGames = new Set(state.selectedGames)
      if (selectedGames.has(action.steamAppId)) selectedGames.delete(action.steamAppId)
      else selectedGames.add(action.steamAppId)
      return { ...state, selectedGames }
    }
    case 'submitted':
      return { ...state, hasVoted: true }
    case 'rematch':
      return {
        ...state,
        result: null,
        hasVoted: false,
        selectedGames: new Set(),
        session: action.session,
        games: action.games,
        voterCount: 0,
        totalMembers: 0,
        isParticipant: true,
        participantIds: [],
        votedUserIds: new Set(),
      }
    default:
      return state
  }
}

export function VotePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('vote.title'))
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  // All voting-session lifecycle state lives in one reducer (see voteReducer).
  // participantIds / votedUserIds drive the per-participant progress dots on
  // the waiting screen so members can see *who* the session is waiting on.
  const [state, dispatch] = useReducer(voteReducer, initialVoteState)
  const {
    session,
    games,
    selectedGames,
    voterCount,
    totalMembers,
    result,
    hasVoted,
    isParticipant,
    noSession,
    participantIds,
    votedUserIds,
  } = state
  // Transient UI flags kept as plain local state (independent of each other and
  // of the session lifecycle).
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [rematching, setRematching] = useState(false)
  const [search, setSearch] = useState('')
  const [detailGame, setDetailGame] = useState<Game | null>(null)

  // Fire vote.completed exactly once, when the result first arrives (either
  // via the close API response or the vote:closed socket event). Guarding on
  // steamAppId keeps a synthetic null-reset from double-firing the event.
  const completedSessionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!result || !session) return
    if (completedSessionRef.current === session.id) return
    completedSessionRef.current = session.id
    track('vote.completed', {
      yesCount: result.yesCount,
      totalVoters: result.totalVoters,
      hasWinner: Number.isInteger(result.steamAppId) && result.steamAppId > 0,
    })
  }, [result, session])

  useEffect(() => {
    if (!id) return
    let cancelled = false

    api.getVoteSession(id).then(
      (data) => {
        if (cancelled) return
        if (!data.session) {
          dispatch({ type: 'noSession' })
          return
        }
        const selected = new Set<number>()
        let hasVotedYet = false
        if (data.myVotes.length > 0) {
          hasVotedYet = true
          for (const v of data.myVotes) {
            if (v.vote) selected.add(v.steamAppId)
          }
        }
        dispatch({
          type: 'loaded',
          session: { id: data.session.id, createdBy: data.session.createdBy, scheduledAt: data.session.scheduledAt },
          games: data.games,
          voterCount: data.voterCount,
          totalMembers: data.totalMembers,
          isParticipant: data.isParticipant !== false,
          participantIds: data.participantIds ?? [],
          votedUserIds: new Set(data.votedUserIds ?? []),
          hasVoted: hasVotedYet,
          selectedGames: selected,
        })
      },
      () => {
        if (!cancelled) navigate(`/groups/${id}`)
      }
    )

    const socket = getSocket()
    socket.emit('group:join', id)

    // The reducer handles idempotent per-participant tracking; re-receiving
    // the same userId is a no-op.
    socket.on('vote:cast', (data) => {
      dispatch({
        type: 'voteCast',
        voterCount: data.voterCount,
        totalMembers: data.totalParticipants || undefined,
        userId: typeof data.userId === 'string' ? data.userId : undefined,
      })
    })

    socket.on('vote:closed', (data) => {
      dispatch({ type: 'closed', result: data.result })
    })

    return () => {
      cancelled = true
      socket.emit('group:leave', id)
      socket.off('vote:cast')
      socket.off('vote:closed')
    }
  }, [id, navigate])

  const toggleGame = useCallback((steamAppId: number) => {
    dispatch({ type: 'toggleGame', steamAppId })
  }, [])

  const submitVotes = useCallback(async () => {
    if (!id || !session || submitting) return
    setSubmitting(true)

    try {
      // Send all votes in a single request: selected = true, not selected = false
      const votes = games.map(game => ({
        steamAppId: game.steamAppId,
        vote: selectedGames.has(game.steamAppId),
      }))
      await api.castVotes(id, session.id, votes)
      dispatch({ type: 'submitted' })
    } catch (err) {
      toast.error(t('vote.voteError'))
      console.error('Failed to submit votes:', err)
    } finally {
      setSubmitting(false)
    }
  }, [id, session, games, selectedGames, submitting, t])

  const handleClose = async () => {
    if (!id || !session || closing) return
    setClosing(true)
    try {
      const data = await api.closeVote(id, session.id)
      dispatch({ type: 'closed', result: data.result })
    } catch (err) {
      toast.error(t('vote.closeError'))
      console.error('Failed to close vote:', err)
    } finally {
      setClosing(false)
    }
  }

  const handleRematch = useCallback(async () => {
    if (!id || !session || rematching) return
    setRematching(true)
    try {
      const data = await api.rematchVote(id, session.id)
      // Reset state to show the new voting session
      dispatch({
        type: 'rematch',
        session: { id: data.session.id, createdBy: data.session.createdBy, scheduledAt: data.session.scheduledAt },
        games: data.games,
      })
    } catch (err) {
      toast.error(t('vote.rematchError'))
      console.error('Failed to start rematch:', err)
    } finally {
      setRematching(false)
    }
  }, [id, session, rematching, t])

  const filteredGames = useMemo(() => {
    if (!search.trim()) return games
    const q = search.toLowerCase()
    return games.filter(g => g.gameName.toLowerCase().includes(q))
  }, [games, search])

  // Keep a stable ref to the latest handleRematch closure so the launch-timeout
  // toast (scheduled from the click handler) always rematches the live session.
  const handleRematchRef = useRef(handleRematch)
  handleRematchRef.current = handleRematch

  // Soft "still here? game not launching?" prompt. Five minutes after the user
  // clicks the Steam launch link, if they're still on the result screen, we
  // pop a non-blocking toast offering to rematch. The Steam protocol handler
  // can fail silently (uninstalled app, missing DLC, blocked URL) and there
  // was previously no path back to the vote without restarting the flow.
  // Scheduled from the click handler (a side effect of the click, not of
  // render); the ref holds the pending timer so it survives re-renders and is
  // cleared on unmount.
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const timerRef = launchTimerRef
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleSteamLaunch = useCallback((steamAppId: number) => {
    track('game.launched_in_steam', { steamAppId })
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current)
    launchTimerRef.current = setTimeout(() => {
      toast(t('vote.launchTimeout'), {
        description: t('vote.launchTimeoutDescription'),
        duration: 15000,
        action: {
          label: t('vote.tryAnother'),
          onClick: () => { void handleRematchRef.current() },
        },
      })
    }, 5 * 60 * 1000)
  }, [t])

  const canClose = session && (session.createdBy === user?.id)

  // No active session
  if (noSession) {
    return (
      <div className="min-h-dvh flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}`)} aria-label={t('group.back')}>
            <ArrowLeft className="size-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={CircleOff}
            title={t('vote.noActiveSessionTitle')}
            description={t('vote.noActiveSessionDescription')}
            action={{
              label: t('vote.backToGroup'),
              onClick: () => navigate(`/groups/${id}`),
            }}
          />
        </main>
        <AppFooter />
      </div>
    )
  }

  // Result screen — owns its reveal choreography, focus management and
  // reduced-motion hooks. The parent keeps the lifecycle effects
  // (completedSessionRef, launch-timeout toast) since they read `session`.
  if (result) {
    return (
      <ResultScreen
        result={result}
        sessionId={session?.id ?? null}
        rematching={rematching}
        onRematch={handleRematch}
        onBack={() => navigate(`/groups/${id}`)}
        onSteamLaunch={handleSteamLaunch}
      />
    )
  }

  // Waiting screen (already voted)
  if (hasVoted) {
    return (
      <WaitingScreen
        session={session}
        selectedCount={selectedGames.size}
        voterCount={voterCount}
        totalMembers={totalMembers}
        participantIds={participantIds}
        votedUserIds={votedUserIds}
        canClose={canClose}
        closing={closing}
        onClose={handleClose}
        onBack={() => navigate(`/groups/${id}`)}
      />
    )
  }

  // Non-participant view
  if (!isParticipant) {
    return (
      <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center p-4">
        <Vote className="size-16 text-muted-foreground mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-heading font-bold mb-2">{t('vote.sessionInProgress')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('vote.notParticipant')}
        </p>
        <Button
          variant="ghost"
          onClick={() => navigate(`/groups/${id}`)}
        >
          {t('vote.backToGroup')}
        </Button>
      </main>
    )
  }

  // Game selection interface
  return (
    <GameSelection
      games={games}
      filteredGames={filteredGames}
      selectedGames={selectedGames}
      search={search}
      detailGame={detailGame}
      submitting={submitting}
      onSearchChange={setSearch}
      onToggleGame={toggleGame}
      onShowDetails={setDetailGame}
      onSubmit={submitVotes}
      onBack={() => navigate(`/groups/${id}`)}
    />
  )
}
