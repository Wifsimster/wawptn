import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Vote, ChevronUp, Dices } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/group.store'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
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

export function GroupPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup, leaveGroup, deleteGroup, renameGroup } = useGroupStore()
  const { user } = useAuthStore()
  const [commonGames, setCommonGames] = useState<{ steamAppId: number; gameId?: string; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null; genres: { id: string; description: string }[] | null; metacriticScore: number | null; type: string | null; shortDescription: string | null; platforms: { windows: boolean; mac: boolean; linux: boolean } | null; recommendationsTotal: number | null; releaseDate: string | null; comingSoon: boolean | null; controllerSupport: string | null; isFree: boolean | null }[]>([])
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

  useEffect(() => {
    if (!id) return
    fetchGroup(id)
    loadCommonGames(id, activeFilter)
    loadVoteHistory(id)

    const socket = getSocket()
    socket.emit('group:join', id)

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
    socket.on('library:synced', () => loadCommonGames(id, activeFilter))
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
  }, [id, fetchGroup, navigate, loadCommonGames, activeFilter, t, user?.id])

  const handleSync = async () => {
    if (!id) return
    setSyncing(true)
    try {
      await api.syncLibraries(id)
      toast.success(t('group.syncSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('group.syncError'))
    } finally {
      setTimeout(() => setSyncing(false), 3000)
    }
  }

  const handleStartVote = async (participantIds: string[], scheduledAt?: string, filters?: { multiplayer: boolean; coop: boolean; free: boolean }) => {
    if (!id) return
    try {
      const hasActiveFilters = filters && (filters.multiplayer || filters.coop || filters.free)
      await api.createVoteSession(id, participantIds, activeFilter, scheduledAt, hasActiveFilters ? filters : undefined)
      navigate(`/groups/${id}/vote`)
    } catch (err) {
      if (err instanceof Error && err.message.includes('already open')) {
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

  const onlineMembers = useMemo(() => new Set(onlineUserIds), [onlineUserIds])
  const lastSeenMap = lastSeenMapRef.current
  const currentUserRole = currentGroup?.members.find(m => m.id === user?.id)?.role || 'member'

  if (!currentGroup) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader maxWidth="wide">
          <Skeleton className="h-5 w-5 rounded" />
        </AppHeader>
        <main id="main-content" className="max-w-6xl mx-auto p-4">
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
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label={t('group.back')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base sm:text-lg font-heading font-bold truncate max-w-[50vw] sm:max-w-none">{currentGroup.name}</h1>
          {onlineUserIds.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
              {onlineUserIds.length} en ligne
            </Badge>
          )}
        </div>
      </AppHeader>

      <main id="main-content" className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {/* Mobile: mini-bar that opens sidebar sheet */}
        <button
          type="button"
          className="lg:hidden mb-4 w-full min-h-[44px] rounded-lg border border-border bg-card/50 p-3 active:bg-card/80 active:scale-[0.98] transition-all"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label={t('group.openSidebar')}
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 shrink-0">
              {currentGroup.members.slice(0, 5).map((member) => (
                <Avatar key={member.id} className="w-7 h-7 ring-2 ring-background">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback className="text-[10px]">{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
              {currentGroup.members.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                  +{currentGroup.members.length - 5}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{currentGroup.name}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground">{t('group.members', { count: currentGroup.members.length })}</p>
                {onlineUserIds.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
                    {onlineUserIds.length} en ligne
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <ChevronUp className="w-5 h-5 text-muted-foreground animate-bounce" />
              <span className="text-[9px] text-muted-foreground leading-none">Ouvrir</span>
            </div>
          </div>
        </button>

        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
          {/* Sidebar — hidden on mobile, shown on lg+ */}
          <div className="hidden lg:block">
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

          {/* Main content: games grid */}
          <div className="space-y-3 sm:space-y-4">
            {/* Action buttons — full-width stacked on mobile, grid on sm+ */}
            <div className="hidden sm:grid sm:grid-cols-2 gap-3">
              <Button
                onClick={() => setVoteSetupOpen(true)}
                className="h-auto py-4 flex-col card-hover-glow"
              >
                <Vote className="w-6 h-6 mb-1" />
                <span className="text-lg font-heading font-bold block">{t('group.startVote')}</span>
                <span className="text-sm opacity-80">{t('group.commonGamesCount', { count: commonGames.length })}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => setRandomPickOpen(true)}
                disabled={commonGames.length === 0}
                className="h-auto py-4 flex-col card-hover-glow"
              >
                <Dices className="w-6 h-6 mb-1" />
                <span className="text-lg font-heading font-bold block">{t('group.randomPick')}</span>
                <span className="text-sm opacity-80">{t('group.randomPickHint')}</span>
              </Button>
            </div>

            {/* Mobile: fixed bottom action bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <Button
                  onClick={() => setVoteSetupOpen(true)}
                  className="flex-1 h-12 gap-2 active:scale-[0.98] transition-transform"
                >
                  <Vote className="w-5 h-5" />
                  <span className="font-heading font-bold">{t('group.startVote')}</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRandomPickOpen(true)}
                  disabled={commonGames.length === 0}
                  className="h-12 px-4 active:scale-[0.98] transition-transform"
                >
                  <Dices className="w-5 h-5" />
                </Button>
              </div>
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
