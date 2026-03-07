import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Vote, AlertTriangle, ChevronUp, Dices } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/group.store'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AppHeader } from '@/components/app-header'
import { GroupSidebar } from '@/components/group-sidebar'
import { GameGrid } from '@/components/game-grid'
import { RandomPickModal } from '@/components/random-pick-modal'

export function GroupPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup } = useGroupStore()
  const [commonGames, setCommonGames] = useState<{ steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number; isMultiplayer: boolean | null; isCoop: boolean | null }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [voteHistory, setVoteHistory] = useState<{ id: string; winningGameAppId: number; winningGameName: string; closedAt: string }[]>([])
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)
  const [multiplayerOnly, setMultiplayerOnly] = useState(true)
  const [confirmVoteOpen, setConfirmVoteOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [randomPickOpen, setRandomPickOpen] = useState(false)

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

  const activeFilter = multiplayerOnly ? 'multiplayer' : undefined

  useEffect(() => {
    if (!id) return
    fetchGroup(id)
    loadCommonGames(id, activeFilter)
    loadVoteHistory(id)

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('member:joined', () => fetchGroup(id))
    socket.on('library:synced', () => loadCommonGames(id, activeFilter))
    socket.on('session:created', () => {
      toast(t('group.voteStarted'), {
        action: {
          label: t('group.joinVote'),
          onClick: () => navigate(`/groups/${id}/vote`),
        },
        duration: 10000,
      })
    })

    return () => {
      socket.emit('group:leave', id)
      socket.off('member:joined')
      socket.off('library:synced')
      socket.off('session:created')
    }
  }, [id, fetchGroup, navigate, loadCommonGames, activeFilter])

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

  const handleStartVote = async () => {
    if (!id) return
    try {
      await api.createVoteSession(id, activeFilter)
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

  if (!currentGroup) {
    return (
      <div className="min-h-screen">
        <AppHeader maxWidth="wide">
          <Skeleton className="h-5 w-5 rounded" />
        </AppHeader>
        <main className="max-w-6xl mx-auto p-4">
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

      <main className="max-w-6xl mx-auto p-4">
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
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
            />
          </div>

          {/* Main content: games grid */}
          <div className="space-y-4">
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setConfirmVoteOpen(true)}
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

            <Dialog open={confirmVoteOpen} onOpenChange={setConfirmVoteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-primary" />
                    {t('group.confirmVoteTitle')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('group.confirmVoteDescription', { count: commonGames.length })}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-3 mt-4 justify-end">
                  <Button variant="secondary" onClick={() => setConfirmVoteOpen(false)}>
                    {t('group.cancel')}
                  </Button>
                  <Button onClick={() => { setConfirmVoteOpen(false); handleStartVote() }}>
                    {t('group.confirmStartVote')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <GameGrid
              games={commonGames}
              loading={loadingGames}
              multiplayerOnly={multiplayerOnly}
              onToggleMultiplayer={setMultiplayerOnly}
            />
          </div>
        </div>

        {/* Mobile: sidebar as dialog sheet */}
        <Dialog open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{currentGroup.name}</DialogTitle>
            </DialogHeader>
            <GroupSidebar
              members={currentGroup.members}
              syncing={syncing}
              inviteToken={inviteToken}
              voteHistory={voteHistory}
              onSync={handleSync}
              onGenerateInvite={handleGenerateInvite}
            />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
