import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Gamepad2, RefreshCw, Vote, Users, Share2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { useGroupStore } from '@/stores/group.store'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { InviteLink } from '@/components/invite-link'

export function GroupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup } = useGroupStore()
  const [commonGames, setCommonGames] = useState<{ steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<{ winningGameName: string; closedAt: string } | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchGroup(id)
    loadCommonGames(id)
    loadLastResult(id)

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('member:joined', () => fetchGroup(id))
    socket.on('library:synced', () => loadCommonGames(id))
    socket.on('session:created', () => navigate(`/groups/${id}/vote`))

    return () => {
      socket.emit('group:leave', id)
      socket.off('member:joined')
      socket.off('library:synced')
      socket.off('session:created')
    }
  }, [id, fetchGroup, navigate])

  const loadCommonGames = async (groupId: string) => {
    setLoadingGames(true)
    try {
      const result = await api.getCommonGames(groupId)
      setCommonGames(result.games)
    } catch {
      toast.error('Impossible de charger les jeux en commun')
    } finally {
      setLoadingGames(false)
    }
  }

  const loadLastResult = async (groupId: string) => {
    try {
      const history = await api.getVoteHistory(groupId)
      if (history.length > 0 && history[0]) {
        setLastResult({ winningGameName: history[0].winningGameName, closedAt: history[0].closedAt })
      }
    } catch {
      // Non-critical, fail silently
    }
  }

  const handleSync = async () => {
    if (!id) return
    setSyncing(true)
    try {
      await api.syncLibraries(id)
      toast.success('Synchronisation lancee !')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setTimeout(() => setSyncing(false), 3000)
    }
  }

  const handleStartVote = async () => {
    if (!id) return
    try {
      await api.createVoteSession(id)
      navigate(`/groups/${id}/vote`)
    } catch (err) {
      if (err instanceof Error && err.message.includes('already open')) {
        navigate(`/groups/${id}/vote`)
      } else {
        toast.error(err instanceof Error ? err.message : 'Impossible de lancer le vote')
      }
    }
  }

  const handleGenerateInvite = async () => {
    if (!id) return
    try {
      const result = await api.generateInvite(id)
      setInviteToken(result.inviteToken)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de generer l'invitation")
    }
  }

  if (!currentGroup) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border p-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-32" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-[100px] w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
          <Skeleton className="h-[200px] w-full rounded-lg" />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Retour">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Gamepad2 className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-lg">{currentGroup.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Last Result */}
        {lastResult && (
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">Derniere soiree</span>
              </div>
              <p className="font-semibold text-lg">{lastResult.winningGameName}</p>
            </CardContent>
          </Card>
        )}

        {/* Start Vote CTA */}
        <Button
          onClick={handleStartVote}
          className="w-full h-auto p-6 flex-col"
        >
          <Vote className="w-8 h-8 mb-2" />
          <span className="text-xl font-bold block">Lancer un vote pour ce soir</span>
          <span className="text-sm opacity-80">{commonGames.length} jeux en commun</span>
        </Button>

        {/* Members */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Membres ({currentGroup.members.length})
            </h2>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleSync} aria-label="Synchroniser les bibliotheques">
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Synchroniser les bibliotheques</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleGenerateInvite} aria-label="Inviter">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generer un lien d'invitation</TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>

          <CardContent>
            {inviteToken && <InviteLink token={inviteToken} />}

            <div className="space-y-2 mt-2">
              {currentGroup.members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 py-2">
                  <Avatar>
                    <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                    <AvatarFallback>{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{member.displayName}</span>
                    {member.role === 'owner' && (
                      <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">owner</span>
                    )}
                  </div>
                  {!member.libraryVisible && (
                    <span className="text-xs text-destructive">Bibliotheque privee</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Common Games */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Jeux en commun ({commonGames.length})</h2>
          </CardHeader>
          <CardContent>
            {loadingGames ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="w-full aspect-[460/215] rounded" />
                ))}
              </div>
            ) : commonGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun jeu en commun trouve. Verifie que tous les membres ont synchronise leur bibliotheque et que leur profil Steam est public.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {commonGames.slice(0, 12).map((game) => (
                  <div key={game.steamAppId} className="relative group">
                    <img
                      src={game.headerImageUrl}
                      alt={game.gameName}
                      className="w-full rounded aspect-[460/215] object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded flex items-end p-2">
                      <span className="text-xs font-medium text-white leading-tight">{game.gameName}</span>
                    </div>
                    {game.ownerCount < game.totalMembers && (
                      <span className="absolute top-1 right-1 text-[10px] bg-black/70 text-white px-1 rounded">
                        {game.ownerCount}/{game.totalMembers}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
