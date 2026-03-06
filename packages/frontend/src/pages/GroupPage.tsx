import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Gamepad2, RefreshCw, Vote, Users, Share2, Trophy } from 'lucide-react'
import { useGroupStore } from '@/stores/group.store'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export function GroupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentGroup, fetchGroup } = useGroupStore()
  const [commonGames, setCommonGames] = useState<{ steamAppId: number; gameName: string; headerImageUrl: string; ownerCount: number; totalMembers: number }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState<{ winningGameName: string; closedAt: string } | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)

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
    try {
      const result = await api.getCommonGames(groupId)
      setCommonGames(result.games)
    } catch { /* empty */ }
  }

  const loadLastResult = async (groupId: string) => {
    try {
      const history = await api.getVoteHistory(groupId)
      if (history.length > 0 && history[0]) {
        setLastResult({ winningGameName: history[0].winningGameName, closedAt: history[0].closedAt })
      }
    } catch { /* empty */ }
  }

  const handleSync = async () => {
    if (!id) return
    setSyncing(true)
    try {
      await api.syncLibraries(id)
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
      // If session already exists, navigate to it
      if (err instanceof Error && err.message.includes('already open')) {
        navigate(`/groups/${id}/vote`)
      }
    }
  }

  const handleGenerateInvite = async () => {
    if (!id) return
    const result = await api.generateInvite(id)
    setInviteToken(result.inviteToken)
  }

  if (!currentGroup) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Gamepad2 className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-lg">{currentGroup.name}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Last Result */}
        {lastResult && (
          <div className="p-4 bg-card rounded-lg border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Last game night</span>
            </div>
            <p className="font-semibold text-lg">{lastResult.winningGameName}</p>
          </div>
        )}

        {/* Start Vote CTA */}
        <button
          onClick={handleStartVote}
          className="w-full p-6 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-center"
        >
          <Vote className="w-8 h-8 mx-auto mb-2" />
          <span className="text-xl font-bold block">Start a Vote for Tonight</span>
          <span className="text-sm opacity-80">{commonGames.length} common games available</span>
        </button>

        {/* Members */}
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Members ({currentGroup.members.length})
            </h2>
            <div className="flex gap-2">
              <button onClick={handleSync} className="text-muted-foreground hover:text-foreground transition-colors" title="Sync libraries">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={handleGenerateInvite} className="text-muted-foreground hover:text-foreground transition-colors" title="Invite">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inviteToken && (
            <div className="mb-3 p-3 bg-background rounded border border-border">
              <p className="text-xs text-muted-foreground mb-1">Share this invite link:</p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-secondary px-2 py-1 rounded break-all">
                  {window.location.origin}/join/{inviteToken}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${inviteToken}`)}
                  className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {currentGroup.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 py-2">
                <img src={member.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <span className="text-sm font-medium">{member.displayName}</span>
                  {member.role === 'owner' && (
                    <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">owner</span>
                  )}
                </div>
                {!member.libraryVisible && (
                  <span className="text-xs text-destructive">Library private</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Common Games */}
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-3">Common Games ({commonGames.length})</h2>
          {commonGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No common games found. Make sure all members have synced their libraries and their Steam profiles are public.
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
        </div>
      </main>
    </div>
  )
}
