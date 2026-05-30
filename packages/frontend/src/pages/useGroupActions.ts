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
  // Local data-reducer dispatchers the action handlers need to keep the page
  // in sync after a mutation, kept narrow so the hook doesn't depend on the
  // page's full reducer shape.
  onActiveVoteSession: (session: ActiveVoteSession | null) => void
  onRemoveHistoryEntry: (sessionId: string) => void
  reloadActiveVoteSession: (groupId: string) => void
  openVoteSetup: () => void
}

// All side-effecting actions for the group detail page (sync, vote lifecycle,
// invites, membership, settings). Extracted from GroupPage to keep that
// component focused on rendering and live-data orchestration.
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
      // Record the new session locally so the hero flips immediately even
      // if the socket event loses the race with the navigation.
      onActiveVoteSession({ id: result.session.id, scheduledAt: result.session.scheduledAt })
      track('vote.started', {
        participantCount: participantIds.length,
        scheduled: !!scheduledAt,
        hasFilters: !!hasActiveFilters,
      })
      navigate(`/groups/${id}/vote`)
    } catch (err) {
      // 409 conflict = another vote is already open for this group. The
      // backend enforces "one open session per group" via a partial
      // unique index. We normally prevent reaching this path by
      // short-circuiting the CTA when `activeVoteSession` is populated,
      // but a race (two clients clicking "start vote" at once) can still
      // land here. Refresh the local state so future clicks route to the
      // join variant, then redirect the user to the existing vote.
      if (err instanceof ApiError && err.status === 409) {
        toast.info(t('group.voteAlreadyOpen'))
        reloadActiveVoteSession(id)
        navigate(`/groups/${id}/vote`)
      } else {
        toast.error(err instanceof Error ? err.message : t('group.startVoteError'))
      }
    }
  }

  // Unified CTA entry point for the "start vote" buttons scattered across
  // the hero, the mobile bottom bar, and the sidebar. When a vote is
  // already open we skip the setup dialog entirely and drop the user on
  // the existing vote page. This is the fix for the UX bug where users
  // would walk through the dialog only to be told a vote is already in
  // progress on the next page.
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
      // Re-fetch group to update the member's notificationsEnabled state
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
  }
}
