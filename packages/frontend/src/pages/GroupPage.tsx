import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AppHeader } from '@/components/app-header'
import { GroupSidebar } from '@/components/group-sidebar'
import { GameGrid, type GameFilters } from '@/components/game-grid'
import { RandomPickModal } from '@/components/random-pick-modal'
import { VoteSetupDialog } from '@/components/vote-setup-dialog'

export function GroupPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup } = useGroupStore()
  const { user } = useAuthStore()
  const [commonGames, setCommonGames] = useState<{ steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null; genres: { id: string; description: string }[] | null; metacriticScore: number | null; type: string | null; shortDescription: string | null; platforms: { windows: boolean; mac: boolean; linux: boolean } | null; recommendationsTotal: number | null; releaseDate: string | null; comingSoon: boolean | null; controllerSupport: string | null; isFree: boolean | null }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [voteHistory, setVoteHistory] = useState<{ id: string; winningGameAppId: number; winningGameName: string; closedAt: string }[]>([])
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)
  const [gameFilters, setGameFilters] = useState<GameFilters>({
    multiplayerOnly: true,
    coopOnly: false,
    selectedGenres: [],
    minMetacritic: null,
    gamesOnly: true,
    controllerOnly: false,
    platform: 'all',
    sortBy: 'owners',
  })
  const [voteSetupOpen, setVoteSetupOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [randomPickOpen, setRandomPickOpen] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])

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
    socket.on('member:offline', (data) => setOnlineUserIds((prev) => prev.filter((id) => id !== data.userId)))
    socket.on('member:joined', () => fetchGroup(id))
    socket.on('library:synced', () => loadCommonGames(id, activeFilter))
    socket.on('session:created', (data) => {
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

  const handleStartVote = async (participantIds: string[], scheduledAt?: string) => {
    if (!id) return
    try {
      await api.createVoteSession(id, participantIds, activeFilter, scheduledAt)
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

  const onlineMembers = useMemo(() => new Set(onlineUserIds), [onlineUserIds])

  if (!currentGroup) {
    return (
      <div className="min-h-screen">
        <AppHeader maxWidth="wide">
          <Skeleton className="h-5 w-5 rounded" />
        </AppHeader>
        <main id="main-content" className="max-w-6xl mx-auto p-4">
          <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
            <Skeleton className="hidden lg:block h-[300px] rounded-lg" />
            <Skeleton className="h-[400px] w-full rounded-lg" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppHeader maxWidth="wide">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label={t('group.back')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="max-w-6xl mx-auto p-4">
        {/* Mobile: tappable avatar bar that opens sidebar sheet */}
        <button
          type="button"
          className="lg:hidden mb-4 w-full"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label={t('group.openSidebar')}
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t('group.members', { count: currentGroup.members.length })}</span>
            {currentGroup.members.map((member) => (
              <Avatar key={member.id} className="w-8 h-8 shrink-0">
                <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
          </div>
        </button>

        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
          {/* Sidebar — hidden on mobile, shown on lg+ */}
          <div className="hidden lg:block">
            <GroupSidebar
              members={currentGroup.members}
              syncing={syncing}
              inviteToken={inviteToken}
              voteHistory={voteHistory}
              onlineMembers={onlineMembers}
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
            />
          </div>

          {/* Main content: games grid */}
          <div className="space-y-4">
            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={() => setVoteSetupOpen(true)}
                className="h-auto py-4 flex-col"
              >
                <Vote className="w-6 h-6 mb-1" />
                <span className="text-lg font-bold block">{t('group.startVote')}</span>
                <span className="text-sm opacity-80">{t('group.commonGamesCount', { count: commonGames.length })}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => setRandomPickOpen(true)}
                disabled={commonGames.length === 0}
                className="h-auto py-4 flex-col"
              >
                <Dices className="w-6 h-6 mb-1" />
                <span className="text-lg font-bold block">{t('group.randomPick')}</span>
                <span className="text-sm opacity-80">{t('group.randomPickHint')}</span>
              </Button>
            </div>

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
              onSetPlatform={(value) => setGameFilters(prev => ({
                ...prev,
                platform: value,
              }))}
              onSetSortBy={(value) => setGameFilters(prev => ({
                ...prev,
                sortBy: value,
              }))}
            />
          </div>
        </div>

        {/* Mobile: sidebar as dialog sheet */}
        <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{currentGroup.name}</DialogTitle>
            </DialogHeader>
            <GroupSidebar
              members={currentGroup.members}
              syncing={syncing}
              inviteToken={inviteToken}
              voteHistory={voteHistory}
              onlineMembers={onlineMembers}
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
            />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
