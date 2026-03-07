import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ThumbsUp, ThumbsDown, Check, ExternalLink, Loader2, Vote } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { AppHeader } from '@/components/app-header'
import { CountdownTimer } from '@/components/countdown-timer'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  const [, setMyVotes] = useState<Map<number, boolean>>(new Map())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [voterCount, setVoterCount] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  const [result, setResult] = useState<VoteResult | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [voting, setVoting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [isParticipant, setIsParticipant] = useState(true)
  const votingRef = useRef(false)

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

        const votes = new Map<number, boolean>()
        for (const v of data.myVotes) {
          votes.set(v.steamAppId, v.vote)
        }
        setMyVotes(votes)
        if (data.myVotes.length > 0) {
          setHasVoted(true)
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

  const castVote = useCallback(async (steamAppId: number, vote: boolean) => {
    if (!id || !session || votingRef.current) return
    votingRef.current = true
    setVoting(true)
    setMyVotes(prev => new Map(prev).set(steamAppId, vote))

    try {
      await api.castVote(id, session.id, steamAppId, vote)
    } catch (err) {
      toast.error(t('vote.voteError'))
      console.error('Failed to cast vote:', err)
    } finally {
      votingRef.current = false
      setVoting(false)
    }

    if (currentIndex < games.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setHasVoted(true)
    }
  }, [id, session, currentIndex, games.length, t])

  // Keyboard navigation for voting
  useEffect(() => {
    if (hasVoted || result || !games[currentIndex]) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        castVote(games[currentIndex]!.steamAppId, false)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        castVote(games[currentIndex]!.steamAppId, true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasVoted, result, games, currentIndex, castVote])

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

  const currentGame = games[currentIndex]
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

  // Voting interface
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}`)} aria-label={t('group.back')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        {currentGame && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentGame.steamAppId}
              initial={prefersReducedMotion ? { opacity: 0 } : { x: 300, opacity: 0 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: -300, opacity: 0 }}
              transition={prefersReducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full"
            >
              <Card className="overflow-hidden shadow-xl">
                <img
                  src={currentGame.headerImageUrl}
                  alt={currentGame.gameName}
                  className="w-full aspect-[460/215] object-cover"
                />
                <div className="p-4">
                  <h2 className="text-xl font-bold text-center">{currentGame.gameName}</h2>
                </div>
              </Card>

              <div className="flex justify-center gap-6 sm:gap-8 mt-8">
                <Button
                  variant="ghost"
                  onClick={() => castVote(currentGame.steamAppId, false)}
                  disabled={voting}
                  className="w-16 h-16 rounded-full bg-destructive/20 hover:bg-destructive/40"
                  aria-label={t('vote.voteNo', { game: currentGame.gameName })}
                >
                  <ThumbsDown className="w-7 h-7 text-destructive" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => castVote(currentGame.steamAppId, true)}
                  disabled={voting}
                  className="w-16 h-16 rounded-full bg-success/20 hover:bg-success/40"
                  aria-label={t('vote.voteYes', { game: currentGame.gameName })}
                >
                  <ThumbsUp className="w-7 h-7 text-success" />
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground mt-4">
                {t('vote.keyboardHint')}
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}
