import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users as UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { CommonGame } from '@wawptn/types'
import { useGroupStore } from '@/stores/group.store'
import { useAuthStore } from '@/stores/auth.store'
import { api, ApiError } from '@/lib/api'
import { track } from '@/lib/analytics'
import { getSocket } from '@/lib/socket'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { GroupSidebar } from '@/components/group-sidebar'
import { GameGrid, type GameFilters } from '@/components/game-grid'
import { RandomPickModal } from '@/components/random-pick-modal'
import { VoteSetupDialog } from '@/components/vote-setup-dialog'
import { TonightPickHero } from '@/components/tonight-pick-hero'
import { PersonaBadge } from '@/components/persona-badge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function GroupPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup, leaveGroup, deleteGroup, renameGroup } = useGroupStore()
  useDocumentTitle(currentGroup?.name ?? t('groups.title'))
  const { user } = useAuthStore()
  const [commonGames, setCommonGames] = useState<CommonGame[]>([])
  const [syncing, setSyncing] = useState(false)
  const [voteHistory, setVoteHistory] = useState<{ id: string; winningGameAppId: number; winningGameId?: string; winningGameName: string; closedAt: string; createdBy: string }[]>([])
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)
  const [gameFilters, setGameFilters] = useState<GameFilters>({
    multiplayerOnly: true,
    coopOnly: false,
    selectedGenres: [],
    minMetacritic: null,
    gamesOnly: true,
    controllerOnly: false,
    sortBy: 'popularity',
  })
  const [voteSetupOpen, setVoteSetupOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [randomPickOpen, setRandomPickOpen] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const [todayPersona, setTodayPersona] = useState<{ id: string; name: string; embedColor: number; introMessage: string } | null>(null)
  const lastSeenMapRef = useRef<Map<string, number>>(new Map())

  const loadCommonGames = useCallback(async (groupId: string, filter?: string) => {
    setLoadingGames(true)
    try {
      const result = await api.getCommonGames(groupId, filter)
      setCommonGames(result.games)
    } catch {
      toast.error(t('group.loadGamesError'))
    } finally {
      setLoadingGames(false)
    }
  }, [t])

  const loadVoteHistory = async (groupId: string) => {
    try {
      const history = await api.getVoteHistory(groupId)
      setVoteHistory(history.filter((h: { winningGameName: string }) => h.winningGameName).slice(0, 5))
    } catch {
      // Non-critical, fail silently
    }
  }

  const activeFilter = gameFilters.multiplayerOnly ? 'multiplayer' : gameFilters.coopOnly ? 'coop' : undefined

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

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('persona:changed', (data) => {
      if (data.groupId === id) setTodayPersona(data.persona)
    })
    socket.on('group:presence', (data) => setOnlineUserIds(data.onlineUserIds))
    socket.on('member:online', (data) => setOnlineUserIds((prev) => prev.includes(data.userId) ? prev : [...prev, data.userId]))
    socket.on('member:offline', (data) => {
      lastSeenMapRef.current.set(data.userId, Date.now())
      setOnlineUserIds((prev) => prev.filter((id) => id !== data.userId))
    })
    socket.on('member:joined', () => fetchGroup(id))
    socket.on('member:left', () => fetchGroup(id))
    socket.on('member:kicked', (data) => {
      if (data.userId === user?.id) {
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
      // Don't notify the user who started the vote
      if (data.createdBy === user?.id) return

      // Only show join prompt to participants (or all if no participantIds — legacy)
      const isParticipant = !data.participantIds || !user?.id || data.participantIds.includes(user.id)
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
    }
  }, [id, fetchGroup, navigate, loadCommonGames, t, user?.id])

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

  const handleStartVote = async (participantIds: string[], scheduledAt?: string, filters?: { multiplayer: boolean; coop: boolean; free: boolean }) => {
    if (!id) return
    try {
      const hasActiveFilters = filters && (filters.multiplayer || filters.coop || filters.free)
      await api.createVoteSession(id, participantIds, activeFilter, scheduledAt, hasActiveFilters ? filters : undefined)
      track('vote.started', {
        participantCount: participantIds.length,
        scheduled: !!scheduledAt,
        hasFilters: !!hasActiveFilters,
      })
      navigate(`/groups/${id}/vote`)
    } catch (err) {
      // 409 conflict = another vote is already open for this group. The
      // backend enforces "one open session per group" via a partial
      // unique index; redirect the user to the existing vote so they
      // can join it instead of landing on an error toast.
      if (err instanceof ApiError && err.status === 409) {
        toast.info(t('group.voteAlreadyOpen'))
        navigate(`/groups/${id}/vote`)
      } else {
        toast.error(err instanceof Error ? err.message : t('group.startVoteError'))
      }
    }
  }

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
      setVoteHistory((prev) => prev.filter((h) => h.id !== sessionId))
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

  // Keep the hero persona in sync with the group detail response. The
  // socket listener above applies live midnight/override flips on top.
  useEffect(() => {
    if (currentGroup?.todayPersona) {
      setTodayPersona(currentGroup.todayPersona)
    }
  }, [currentGroup?.todayPersona])

  const onlineMembers = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const lastSeenMap = lastSeenMapRef.current
  const currentUserRole = currentGroup?.members.find(m => m.id === user?.id)?.role || 'member'

  if (!currentGroup) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader maxWidth="wide">
          <Skeleton className="h-5 w-5 rounded" />
        </AppHeader>
        <main
          id="main-content"
          className="max-w-6xl mx-auto p-4"
          role="status"
          aria-busy="true"
          aria-live="polite"
          aria-label={t('common.loading', 'Chargement…')}
        >
          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
            <Skeleton className="hidden lg:block h-[300px] rounded-lg" />
            <Skeleton className="h-[400px] w-full rounded-lg" />
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader maxWidth="wide">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label={t('group.back')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base sm:text-lg font-heading font-bold truncate min-w-0 flex-1">{currentGroup.name}</h1>
          {onlineUserIds.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal shrink-0 hidden sm:inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
              {t('group.onlineCount', { count: onlineUserIds.length })}
            </Badge>
          )}
        </div>
      </AppHeader>

      <main id="main-content" className="w-full max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 min-w-0">
        {/* Mobile: compact member pill strip — replaces the old "Ouvrir"
            mini-bar. Tapping it still opens the sidebar sheet, but the
            visual weight is cut in half and the bouncing chevron is gone. */}
        <button
          type="button"
          className="lg:hidden mb-3 w-full min-h-[40px] rounded-full border border-border/60 bg-card/30 px-3 py-1.5 active:bg-card/60 active:scale-[0.99] transition-all"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label={t('group.openSidebar')}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex -space-x-1.5 shrink-0">
              {currentGroup.members.slice(0, 4).map((member) => (
                <Avatar key={member.id} className="w-6 h-6 ring-2 ring-background">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback className="text-[9px]">{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
              {currentGroup.members.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                  +{currentGroup.members.length - 4}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t('group.members', { count: currentGroup.members.length })}
              </span>
              {onlineUserIds.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-500 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
                  {t('group.onlineCount', { count: onlineUserIds.length })}
                </span>
              )}
            </div>
            <UsersIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </div>
        </button>

        <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
          {/* Sidebar — hidden on mobile, shown on lg+ */}
          <div className="hidden lg:block min-w-0">
            <GroupSidebar
              members={currentGroup.members}
              groupId={id!}
              groupName={currentGroup.name}
              syncing={syncing}
              inviteToken={inviteToken}
              voteHistory={voteHistory}
              onlineMembers={onlineMembers}
              lastSeenMap={lastSeenMap}
              currentUserId={user?.id || ''}
              currentUserRole={currentUserRole}
              autoVoteSchedule={currentGroup.autoVoteSchedule}
              autoVoteDurationMinutes={currentGroup.autoVoteDurationMinutes}
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
              onLeaveGroup={handleLeaveGroup}
              onKickMember={handleKickMember}
              onDeleteGroup={handleDeleteGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteHistory={handleDeleteHistory}
              onToggleNotifications={handleToggleNotifications}
              onUpdateAutoVote={handleUpdateAutoVote}
              onStartVote={() => setVoteSetupOpen(true)}
            />
          </div>

          {/* Main content: hero + games grid */}
          <div className="space-y-3 sm:space-y-4 min-w-0">
            {/* Per-group "persona du jour" — hero variant. Pre-fetched via
                the enriched group detail response, refreshed live via the
                `persona:changed` socket event (midnight flip or owner
                override). */}
            {todayPersona && (
              <PersonaBadge
                groupId={id}
                persona={todayPersona}
                variant="hero"
              />
            )}

            {/* Hero: "Tonight's Pick" — dominant CTA at the top of the page.
                Replaces the old 2-button grid (Start vote / Random pick) and
                surfaces a client-scored recommendation so a first-time user
                can start a vote in one tap without touching any filter. */}
            <TonightPickHero
              games={commonGames}
              loading={loadingGames}
              voteHistory={voteHistory}
              members={currentGroup.members}
              onStartVote={() => setVoteSetupOpen(true)}
              onRandomPick={() => setRandomPickOpen(true)}
            />

            {/* Mobile: fixed bottom action bar — kept as the persistent
                primary CTA on small screens so the vote is always one tap
                away even when the user has scrolled the grid. */}
            <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                onClick={() => setVoteSetupOpen(true)}
                className="w-full h-12 gap-2 active:scale-[0.98] transition-transform"
              >
                <span className="font-heading font-bold">{t('group.startVote')}</span>
                <span className="opacity-80 text-sm">· {t('group.commonGamesCount', { count: commonGames.length })}</span>
              </Button>
            </div>
            {/* Spacer for fixed bottom bar on mobile */}
            <div className="h-16 sm:hidden" />

            <RandomPickModal
              open={randomPickOpen}
              onOpenChange={setRandomPickOpen}
              games={commonGames}
            />

            <VoteSetupDialog
              open={voteSetupOpen}
              onOpenChange={setVoteSetupOpen}
              members={currentGroup.members}
              groupId={id!}
              onlineMembers={onlineMembers}
              activeFilter={activeFilter}
              onStartVote={handleStartVote}
            />

            <GameGrid
              games={commonGames}
              loading={loadingGames}
              filters={gameFilters}
              onSyncLibraries={handleSync}
              syncing={syncing}
              onToggleMultiplayer={(value) => setGameFilters(prev => ({
                ...prev,
                multiplayerOnly: value,
                coopOnly: value ? false : prev.coopOnly,
              }))}
              onToggleCoop={(value) => setGameFilters(prev => ({
                ...prev,
                coopOnly: value,
                multiplayerOnly: value ? false : prev.multiplayerOnly,
              }))}
              onToggleGenre={(genreId) => setGameFilters(prev => ({
                ...prev,
                selectedGenres: prev.selectedGenres.includes(genreId)
                  ? prev.selectedGenres.filter(id => id !== genreId)
                  : [...prev.selectedGenres, genreId],
              }))}
              onSetMinMetacritic={(value) => setGameFilters(prev => ({
                ...prev,
                minMetacritic: value,
              }))}
              onToggleGamesOnly={(value) => setGameFilters(prev => ({
                ...prev,
                gamesOnly: value,
              }))}
              onToggleControllerOnly={(value) => setGameFilters(prev => ({
                ...prev,
                controllerOnly: value,
              }))}
              onSetSortBy={(value) => setGameFilters(prev => ({
                ...prev,
                sortBy: value,
              }))}
              onResetFilters={() => setGameFilters({
                multiplayerOnly: true,
                coopOnly: false,
                selectedGenres: [],
                minMetacritic: null,
                gamesOnly: true,
                controllerOnly: false,
                sortBy: 'popularity',
              })}
              onApplyPreset={(patch) => setGameFilters(prev => ({ ...prev, ...patch }))}
            />
          </div>
        </div>

        {/* Mobile: sidebar as responsive dialog sheet with snap points */}
        <ResponsiveDialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen} snapPoints={[0.55, 1]}>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{currentGroup.name}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <GroupSidebar
              members={currentGroup.members}
              groupId={id!}
              groupName={currentGroup.name}
              syncing={syncing}
              inviteToken={inviteToken}
              voteHistory={voteHistory}
              onlineMembers={onlineMembers}
              lastSeenMap={lastSeenMap}
              currentUserId={user?.id || ''}
              currentUserRole={currentUserRole}
              autoVoteSchedule={currentGroup.autoVoteSchedule}
              autoVoteDurationMinutes={currentGroup.autoVoteDurationMinutes}
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
              onLeaveGroup={handleLeaveGroup}
              onKickMember={handleKickMember}
              onDeleteGroup={handleDeleteGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteHistory={handleDeleteHistory}
              onToggleNotifications={handleToggleNotifications}
              onUpdateAutoVote={handleUpdateAutoVote}
              onStartVote={() => setVoteSetupOpen(true)}
              compact
            />
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </main>
      <AppFooter />
    </div>
  )
}
