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
      const history = await api.getVoteHistory(groupId)
      dispatch({
        type: 'voteHistory',
        entries: history.data.filter((h) => h.winningGameName),
        truncated: history.freeLimitApplied,
      })
    } catch {
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
    }
  }, [dispatch])

  const activeFilterRef = useRef(activeFilter)
  useEffect(() => { activeFilterRef.current = activeFilter }, [activeFilter])

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
    const joinRoom = () => socket.emit('group:join', id)
    joinRoom()
    socket.on('connect', joinRoom)

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
      dispatch({ type: 'activeVoteSession', session: { id: data.sessionId, scheduledAt: data.scheduledAt ?? null } })
      onVoteSetupOpenChange(false)

      if (data.createdBy === currentUserId) return

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
      dispatch({ type: 'activeVoteSession', session: null })
      loadVoteHistory(id)
    })

    return () => {
      socket.off('connect', joinRoom)
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
