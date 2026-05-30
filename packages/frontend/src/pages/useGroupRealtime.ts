import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/group.store'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { groupDataReducer, initialGroupData } from './groupDataReducer'

interface UseGroupRealtimeParams {
  id: string | undefined
  activeFilter: string | undefined
  currentUserId: string | undefined
  onVoteSetupOpenChange: (open: boolean) => void
}

// Owns the group detail page's server-driven data (games, vote history, active
// session, persona, presence) together with the data loading and live socket
// subscription that keeps it fresh. Bundling the reducer here keeps the socket
// effect's writes local to this hook (no pushing data up to the parent) — the
// parent simply reads the returned `data`. Extracted from GroupPage to keep
// that component focused on rendering.
export function useGroupRealtime({
  id,
  activeFilter,
  currentUserId,
  onVoteSetupOpenChange,
}: UseGroupRealtimeParams) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { fetchGroup } = useGroupStore()
  const [data, dispatch] = useReducer(groupDataReducer, initialGroupData)

  // "Last seen" timestamps live in the reducer state (keyed by user id) so the
  // members panel can read them safely during render. Exposed as a Map for the
  // existing consumer interface, memoised so the reference is stable between
  // unrelated re-renders.
  const lastSeenMap = useMemo(
    () => new Map<string, number>(Object.entries(data.lastSeen).map(([id, at]) => [id, at])),
    [data.lastSeen],
  )

  const loadCommonGames = useCallback(async (groupId: string, filter?: string) => {
    dispatch({ type: 'gamesLoading' })
    try {
      const result = await api.getCommonGames(groupId, filter)
      dispatch({ type: 'gamesLoaded', games: result.games })
    } catch {
      toast.error(t('group.loadGamesError'))
      dispatch({ type: 'gamesLoadFailed' })
    }
  }, [t, dispatch])

  const loadVoteHistory = useCallback(async (groupId: string) => {
    try {
      // The endpoint returns { data, total, limit, offset, freeLimitApplied, freeLimit }.
      // Free users are capped server-side to the 10 most recent sessions;
      // `freeLimitApplied` tells us whether to show an upgrade CTA beneath
      // the list.
      const history = await api.getVoteHistory(groupId)
      dispatch({
        type: 'voteHistory',
        entries: history.data.filter((h) => h.winningGameName),
        truncated: history.freeLimitApplied,
      })
    } catch {
      // Non-critical, fail silently
    }
  }, [dispatch])

  const loadActiveVoteSession = useCallback(async (groupId: string) => {
    try {
      const result = await api.getVoteSession(groupId)
      dispatch({
        type: 'activeVoteSession',
        session: result.session
          ? { id: result.session.id, scheduledAt: result.session.scheduledAt }
          : null,
      })
    } catch {
      // Non-critical: if we can't tell, fall back to the normal start-vote
      // flow and let the backend's 409 handler catch any race.
    }
  }, [dispatch])

  // Ref mirror of activeFilter so socket listeners always see the latest
  // value without needing to tear down and re-subscribe on every toggle.
  // Previously `activeFilter` was in the effect deps which caused all socket
  // listeners to churn (and risked missing events during re-subscription).
  const activeFilterRef = useRef(activeFilter)
  useEffect(() => { activeFilterRef.current = activeFilter }, [activeFilter])

  // Refetch common games when the server-side filter changes. Separate from
  // the socket effect so it doesn't cause re-subscription churn.
  useEffect(() => {
    if (!id) return
    loadCommonGames(id, activeFilter)
  }, [id, activeFilter, loadCommonGames])

  useEffect(() => {
    if (!id) return
    fetchGroup(id)
    loadVoteHistory(id)
    loadActiveVoteSession(id)

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('persona:changed', (data) => {
      if (data.groupId === id) dispatch({ type: 'todayPersona', persona: data.persona })
    })
    socket.on('group:presence', (data) => dispatch({ type: 'presence', onlineUserIds: data.onlineUserIds }))
    socket.on('member:online', (data) => dispatch({ type: 'memberOnline', userId: data.userId }))
    socket.on('member:offline', (data) => {
      dispatch({ type: 'memberOffline', userId: data.userId, at: Date.now() })
    })
    socket.on('member:joined', () => fetchGroup(id))
    socket.on('member:left', () => fetchGroup(id))
    socket.on('member:kicked', (data) => {
      if (data.userId === currentUserId) {
        toast.error(t('group.youWereKicked'))
        navigate('/')
      } else {
        fetchGroup(id)
      }
    })
    socket.on('group:deleted', (data) => {
      toast(t('group.groupDeleted', { name: data.groupName }))
      navigate('/')
    })
    socket.on('group:renamed', (data) => {
      fetchGroup(id)
      toast(t('group.groupRenamed', { name: data.newName }))
    })
    socket.on('library:synced', () => loadCommonGames(id, activeFilterRef.current))
    socket.on('session:created', (data) => {
      // Track the new session locally so the hero flips to the "join vote"
      // variant and any in-flight setup dialog is short-circuited. Also
      // covers the user who started the vote — their local state was
      // already updated in handleStartVote, but keeping this listener
      // authoritative avoids subtle drift if two tabs are open.
      dispatch({ type: 'activeVoteSession', session: { id: data.sessionId, scheduledAt: data.scheduledAt ?? null } })
      // If the user had the setup dialog open (e.g. a teammate beat them
      // to the punch), close it — otherwise they'd walk through the form
      // just to hit the 409 conflict handler on submit.
      onVoteSetupOpenChange(false)

      // Don't notify the user who started the vote
      if (data.createdBy === currentUserId) return

      // Only show join prompt to participants (or all if no participantIds — legacy)
      const isParticipant = !data.participantIds || !currentUserId || data.participantIds.includes(currentUserId)
      const toastMessage = data.scheduledAt
        ? t('group.voteScheduled', { date: new Date(data.scheduledAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
        : t('group.voteStarted')
      if (isParticipant) {
        toast(toastMessage, {
          action: {
            label: t('group.joinVote'),
            onClick: () => navigate(`/groups/${id}/vote`),
          },
          duration: 10000,
        })
      } else {
        toast(t('group.voteStartedOthers'))
      }
    })
    socket.on('vote:closed', () => {
      // Vote finished — clear the in-progress flag so the hero flips back
      // to the normal "start a vote" CTA and the next vote can be created
      // without bouncing off the 409 guard.
      dispatch({ type: 'activeVoteSession', session: null })
      loadVoteHistory(id)
    })

    return () => {
      socket.emit('group:leave', id)
      socket.off('persona:changed')
      socket.off('group:presence')
      socket.off('member:online')
      socket.off('member:offline')
      socket.off('member:joined')
      socket.off('member:left')
      socket.off('member:kicked')
      socket.off('group:deleted')
      socket.off('group:renamed')
      socket.off('library:synced')
      socket.off('session:created')
      socket.off('vote:closed')
    }
  }, [id, fetchGroup, navigate, loadCommonGames, loadVoteHistory, loadActiveVoteSession, t, currentUserId, dispatch, onVoteSetupOpenChange])

  return {
    data,
    dispatch,
    loadActiveVoteSession,
    lastSeenMap,
  }
}
