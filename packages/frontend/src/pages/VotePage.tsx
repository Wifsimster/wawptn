import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, Loader2, Vote, Search, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { AppHeader } from '@/components/app-header'
import { CountdownTimer } from '@/components/countdown-timer'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface Game {
  steamAppId: number
  gameName: string
  headerImageUrl: string
}

interface VoteResult {
  steamAppId: number
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  totalVoters: number
}

export function VotePage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [session, setSession] = useState<{ id: string; createdBy: string; scheduledAt: string | null } | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set())
  const [voterCount, setVoterCount] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  const [result, setResult] = useState<VoteResult | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [isParticipant, setIsParticipant] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false

    api.getVoteSession(id).then(
      (data) => {
        if (cancelled) return
        if (!data.session) {
          navigate(`/groups/${id}`)
          return
        }
        setSession({ id: data.session.id, createdBy: data.session.createdBy, scheduledAt: data.session.scheduledAt })
        setGames(data.games)
        setVoterCount(data.voterCount)
        setTotalMembers(data.totalMembers)
        setIsParticipant(data.isParticipant !== false)

        if (data.myVotes.length > 0) {
          setHasVoted(true)
          const selected = new Set<number>()
          for (const v of data.myVotes) {
            if (v.vote) selected.add(v.steamAppId)
          }
          setSelectedGames(selected)
        }
      },
      () => {
        if (!cancelled) navigate(`/groups/${id}`)
      }
    )

    const socket = getSocket()
    socket.emit('group:join', id)

    socket.on('vote:cast', (data) => {
      setVoterCount(data.voterCount)
      if (data.totalParticipants) setTotalMembers(data.totalParticipants)
    })

    socket.on('vote:closed', (data) => {
      setResult(data.result)
    })

    return () => {
      cancelled = true
      socket.emit('group:leave', id)
      socket.off('vote:cast')
      socket.off('vote:closed')
    }
  }, [id, navigate])

  const toggleGame = useCallback((steamAppId: number) => {
    setSelectedGames(prev => {
      const next = new Set(prev)
      if (next.has(steamAppId)) next.delete(steamAppId)
      else next.add(steamAppId)
      return next
    })
  }, [])

  const submitVotes = useCallback(async () => {
    if (!id || !session || submitting) return
    setSubmitting(true)

    try {
      // Send a vote for each game: selected = true, not selected = false
      const promises = games.map(game =>
        api.castVote(id, session.id, game.steamAppId, selectedGames.has(game.steamAppId))
      )
      await Promise.all(promises)
      setHasVoted(true)
    } catch (err) {
      toast.error(t('vote.voteError'))
      console.error('Failed to submit votes:', err)
    } finally {
      setSubmitting(false)
    }
  }, [id, session, games, selectedGames, submitting, t])

  const handleClose = async () => {
    if (!id || !session || closing) return
    setClosing(true)
    try {
      const data = await api.closeVote(id, session.id)
      setResult(data.result)
    } catch (err) {
      toast.error(t('vote.closeError'))
      console.error('Failed to close vote:', err)
    } finally {
      setClosing(false)
    }
  }

  const filteredGames = useMemo(() => {
    if (!search.trim()) return games
    const q = search.toLowerCase()
    return games.filter(g => g.gameName.toLowerCase().includes(q))
  }, [games, search])

  const canClose = session && (session.createdBy === user?.id)
  const prefersReducedMotion = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []
  )

  // Result screen
  if (result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <AnimatePresence>
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={prefersReducedMotion ? { duration: 0.2 } : { type: 'spring', duration: 0.6 }}
            className="text-center max-w-md w-full"
          >
            <p className="text-sm text-muted-foreground mb-4 uppercase tracking-wide">{t('vote.tonightYouPlay')}</p>
            {result.headerImageUrl && (
              <img
                src={result.headerImageUrl}
                alt={result.gameName}
                className="w-full rounded-lg shadow-2xl mb-6"
              />
            )}
            <h1 className="text-3xl font-bold mb-2">{result.gameName}</h1>
            <p className="text-muted-foreground mb-8">
              {t('vote.votedFor', { yes: result.yesCount, total: result.totalVoters })}
            </p>

            {Number.isInteger(result.steamAppId) && result.steamAppId > 0 && (
              <Button variant="steam" size="lg" asChild>
                <a href={`steam://run/${result.steamAppId}`} className="gap-2">
                  <ExternalLink className="w-5 h-5" />
                  {t('vote.launchSteam')}
                </a>
              </Button>
            )}

            <Button
              variant="ghost"
              className="block mx-auto mt-4"
              onClick={() => navigate(`/groups/${id}`)}
            >
              {t('vote.backToGroup')}
            </Button>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // Waiting screen (already voted)
  if (hasVoted) {
    const scheduledDate = session?.scheduledAt ? new Date(session.scheduledAt) : null
    const isScheduledSession = scheduledDate && scheduledDate.getTime() > Date.now()

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Check className="w-16 h-16 text-success mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('vote.submitted')}</h2>

        {isScheduledSession && (
          <div className="mb-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">{t('vote.scheduledCountdown')}</p>
            <CountdownTimer targetDate={scheduledDate} />
            <p className="text-xs text-muted-foreground mt-3">
              {t('vote.scheduledDate', { date: scheduledDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}
            </p>
          </div>
        )}

        <p className="text-muted-foreground mb-2">
          {t('vote.selectedCount', { count: selectedGames.size })}
        </p>
        <p className="text-muted-foreground mb-6">
          {t('vote.waiting', { done: voterCount, total: totalMembers })}
        </p>

        <Progress value={voterCount} max={totalMembers} className="w-48 mb-8" />

        {canClose && (
          <Button onClick={handleClose} disabled={closing}>
            {closing && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('vote.closeVote')}
          </Button>
        )}

        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate(`/groups/${id}`)}
        >
          {t('vote.backToGroup')}
        </Button>
      </div>
    )
  }

  // Non-participant view
  if (!isParticipant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Vote className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('vote.sessionInProgress')}</h2>
        <p className="text-muted-foreground mb-6">
          {t('vote.notParticipant')}
        </p>
        <Button
          variant="ghost"
          onClick={() => navigate(`/groups/${id}`)}
        >
          {t('vote.backToGroup')}
        </Button>
      </div>
    )
  }

  // Game selection interface
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}`)} aria-label={t('group.back')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">{t('vote.selectGamesTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('vote.selectGamesHint', { count: games.length })}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('group.searchGames')}
            className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Game grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 overflow-y-auto pb-24">
          {filteredGames.map(game => {
            const isSelected = selectedGames.has(game.steamAppId)
            return (
              <button
                key={game.steamAppId}
                onClick={() => toggleGame(game.steamAppId)}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 shadow-lg'
                    : 'border-border hover:border-muted-foreground/40'
                }`}
              >
                <img
                  src={game.headerImageUrl}
                  alt={game.gameName}
                  className={`w-full aspect-[460/215] object-cover transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                  }`}
                />
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs font-medium truncate">{game.gameName}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Floating submit button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t border-border">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t('vote.gamesSelected', { count: selectedGames.size })}
            </span>
            <Button onClick={submitVotes} disabled={submitting || selectedGames.size === 0}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t('vote.submitSelection')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
