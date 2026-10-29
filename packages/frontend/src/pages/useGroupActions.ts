import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/group.store'
import { useAuthStore } from '@/stores/auth.store'
import { api, ApiError } from '@/lib/api'
import { track } from '@/lib/analytics'

interface VoteFilters {
  multiplayer: boolean
  coop: boolean
  free: boolean
}

interface ActiveVoteSession {
  id: string
  scheduledAt: string | null
}

interface UseGroupActionsParams {
  id: string | undefined
  activeFilter: string | undefined
  activeVoteSession: ActiveVoteSession | null
  onActiveVoteSession: (session: ActiveVoteSession | null) => void
  onRemoveHistoryEntry: (sessionId: string) => void
  reloadActiveVoteSession: (groupId: string) => void
  openVoteSetup: () => void
}

export function useGroupActions({
  id,
  activeFilter,
  activeVoteSession,
  onActiveVoteSession,
  onRemoveHistoryEntry,
  reloadActiveVoteSession,
  openVoteSetup,
}: UseGroupActionsParams) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { fetchGroup, leaveGroup, deleteGroup, renameGroup } = useGroupStore()
  const { user } = useAuthStore()

  const [syncing, setSyncing] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)

  const handleSync = async () => {
    if (!id) return
    setSyncing(true)
    track('sync.triggered')
    try {
      await api.syncLibraries(id)
      toast.success(t('group.syncSuccess'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('group.syncError')
      toast.error(msg, {
        action: {
          label: t('common.retry'),
          onClick: () => handleSync(),
        },
      })
    } finally {
      setTimeout(() => setSyncing(false), 3000)
    }
  }

  const handleStartVote = async (participantIds: string[], scheduledAt?: string, filters?: VoteFilters) => {
    if (!id) return
    try {
      const hasActiveFilters = filters && (filters.multiplayer || filters.coop || filters.free)
      const result = await api.createVoteSession(id, participantIds, activeFilter, scheduledAt, hasActiveFilters ? filters : undefined)
      onActiveVoteSession({ id: result.session.id, scheduledAt: result.session.scheduledAt })
      track('vote.started', {
        participantCount: participantIds.length,
        scheduled: !!scheduledAt,
        hasFilters: !!hasActiveFilters,
      })
      navigate(`/groups/${id}/vote`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.info(t('group.voteAlreadyOpen'))
        reloadActiveVoteSession(id)
        navigate(`/groups/${id}/vote`)
      } else {
        toast.error(err instanceof Error ? err.message : t('group.startVoteError'))
      }
    }
  }

  const openVoteFlow = useCallback(() => {
    if (!id) return
    if (activeVoteSession) {
      navigate(`/groups/${id}/vote`)
    } else {
      openVoteSetup()
    }
  }, [id, activeVoteSession, navigate, openVoteSetup])

  const handleGenerateInvite = async () => {
    if (!id) return
    try {
      const result = await api.generateInvite(id)
      setInviteToken(result.inviteToken)
      track('invite.generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.generateInviteError'))
    }
  }

  const handleLeaveGroup = async () => {
    if (!id || !user?.id) return
    try {
      await leaveGroup(id, user.id)
      toast.success(t('group.leftGroup'))
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.leaveError'))
    }
  }

  const handleKickMember = async (userId: string) => {
    if (!id) return
    try {
      await api.leaveGroup(id, userId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.kickError'))
    }
  }

  const handleDeleteGroup = async () => {
    if (!id) return
    try {
      await deleteGroup(id)
      toast.success(t('group.groupDeletedSuccess'))
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.deleteError'))
    }
  }

  const handleRenameGroup = async (name: string) => {
    if (!id) return
    try {
      await renameGroup(id, name)
      toast.success(t('group.renameSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.renameError'))
      throw err
    }
  }

  const handleDeleteHistory = async (sessionId: string) => {
    if (!id) return
    try {
      await api.deleteVoteSession(id, sessionId)
      onRemoveHistoryEntry(sessionId)
      toast.success(t('group.deleteHistorySuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.deleteHistoryError'))
    }
  }

  const handleToggleNotifications = async (enabled: boolean) => {
    if (!id) return
    try {
      await api.toggleNotifications(id, enabled)
      fetchGroup(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.notificationsError'))
    }
  }

  const handleUpdateAutoVote = async (schedule: string | null, durationMinutes: number) => {
    if (!id) return
    try {
      await api.updateAutoVote(id, schedule, durationMinutes)
      toast.success(t('group.autoVoteSuccess'))
      fetchGroup(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.autoVoteError'))
      throw err
    }
  }

  const handleUpdateReleasesDigest = async (input: { enabled: boolean; schedule: string; coopOnly: boolean }) => {
    if (!id) return
    try {
      await api.updateReleasesDigest(id, input)
      toast.success(t('group.releasesDigestSuccess'))
      fetchGroup(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.releasesDigestError'))
      throw err
    }
  }

  const handleTestReleasesDigest = async () => {
    if (!id) return
    try {
      const { delivered } = await api.testReleasesDigest(id)
      if (delivered) {
        toast.success(t('group.releasesDigestTestSuccess'))
      } else {
        toast.error(t('group.releasesDigestTestNotDelivered'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.releasesDigestTestError'))
    }
  }

  const handleToggleNewGameSpotlight = async (enabled: boolean) => {
    if (!id) return
    try {
      await api.updateNewGameSpotlight(id, enabled)
      toast.success(enabled ? t('group.newGameSpotlightEnabledToast') : t('group.newGameSpotlightDisabledToast'))
      fetchGroup(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.newGameSpotlightError'))
    }
  }

  return {
    syncing,
    inviteToken,
    handleSync,
    handleStartVote,
    openVoteFlow,
    handleGenerateInvite,
    handleLeaveGroup,
    handleKickMember,
    handleDeleteGroup,
    handleRenameGroup,
    handleDeleteHistory,
    handleToggleNotifications,
    handleUpdateAutoVote,
    handleUpdateReleasesDigest,
    handleTestReleasesDigest,
    handleToggleNewGameSpotlight,
  }
}
