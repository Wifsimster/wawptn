import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, Loader2, RefreshCw, Vote, Search, Send, Info, Monitor, Apple, Gamepad2, Star, CircleOff } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion, animate, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { track } from '@/lib/analytics'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { CountdownTimer } from '@/components/countdown-timer'
import { EmptyState } from '@/components/empty-state'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import { ShareButton } from '@/components/share-button'
import { CelebrationParticles } from '@/components/celebration-particles'
import { decodeHtmlEntities } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

interface Game {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string
  shortDescription?: string | null
  genres?: { id: string; description: string }[] | null
  metacriticScore?: number | null
  platforms?: { windows: boolean; mac: boolean; linux: boolean } | null
  releaseDate?: string | null
  controllerSupport?: string | null
  isFree?: boolean | null
  type?: string | null
}

interface VoteResult {
  steamAppId: number
  gameId?: string
  gameName: string
  headerImageUrl: string | null
  yesCount: number
  totalVoters: number
}

export function VotePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('vote.title'))
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
  const [rematching, setRematching] = useState(false)
  const [search, setSearch] = useState('')
  const [detailGame, setDetailGame] = useState<Game | null>(null)
  const [noSession, setNoSession] = useState(false)
  // Timestamp of the user's most recent click on the Steam launch link.
  // Used to schedule a soft "still here? game not launching?" prompt.
  const [steamLaunchedAt, setSteamLaunchedAt] = useState<number | null>(null)
  // Set of session participant IDs and the subset that has already cast at
  // least one vote. Used to render per-participant progress on the waiting
  // screen so members can see *who* the session is waiting on, not just a
  // bare count.
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [votedUserIds, setVotedUserIds] = useState<Set<string>>(() => new Set())

  // Fire vote.completed exactly once, when the result first arrives (either
  // via the close API response or the vote:closed socket event). Guarding on
  // steamAppId keeps a synthetic null-reset from double-firing the event.
  const completedSessionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!result || !session) return
    if (completedSessionRef.current === session.id) return
    completedSessionRef.current = session.id
    track('vote.completed', {
      yesCount: result.yesCount,
      totalVoters: result.totalVoters,
      hasWinner: Number.isInteger(result.steamAppId) && result.steamAppId > 0,
    })
  }, [result, session])

  useEffect(() => {
    if (!id) return
    let cancelled = false

    api.getVoteSession(id).then(
      (data) => {
        if (cancelled) return
        if (!data.session) {
          setNoSession(true)
          return
        }
        setSession({ id: data.session.id, createdBy: data.session.createdBy, scheduledAt: data.session.scheduledAt })
        setGames(data.games)
        setVoterCount(data.voterCount)
        setTotalMembers(data.totalMembers)
        setIsParticipant(data.isParticipant !== false)
        setParticipantIds(data.participantIds ?? [])
        setVotedUserIds(new Set(data.votedUserIds ?? []))

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
      // Update the per-participant set so the waiting screen can show who
      // the session is still waiting on. Idempotent — re-receiving the
      // same userId is a no-op.
      if (typeof data.userId === 'string') {
        setVotedUserIds((prev) => {
          if (prev.has(data.userId)) return prev
          const next = new Set(prev)
          next.add(data.userId)
          return next
        })
      }
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
      // Send all votes in a single request: selected = true, not selected = false
      const votes = games.map(game => ({
        steamAppId: game.steamAppId,
        vote: selectedGames.has(game.steamAppId),
      }))
      await api.castVotes(id, session.id, votes)
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

  const handleRematch = async () => {
    if (!id || !session || rematching) return
    setRematching(true)
    try {
      const data = await api.rematchVote(id, session.id)
      // Reset state to show the new voting session
      setResult(null)
      setHasVoted(false)
      setSelectedGames(new Set())
      setSession({ id: data.session.id, createdBy: data.session.createdBy, scheduledAt: data.session.scheduledAt })
      setGames(data.games)
      setVoterCount(0)
      setTotalMembers(0)
      setIsParticipant(true)
      setParticipantIds([])
      setVotedUserIds(new Set())
    } catch (err) {
      toast.error(t('vote.rematchError'))
      console.error('Failed to start rematch:', err)
    } finally {
      setRematching(false)
    }
  }

  const filteredGames = useMemo(() => {
    if (!search.trim()) return games
    const q = search.toLowerCase()
    return games.filter(g => g.gameName.toLowerCase().includes(q))
  }, [games, search])

  // Keep a stable ref to the latest handleRematch closure so the launch-timeout
  // effect below doesn't have to re-create its setTimeout on every render.
  const handleRematchRef = useRef(handleRematch)
  handleRematchRef.current = handleRematch

  // Soft "still here? game not launching?" prompt. Five minutes after the user
  // clicks the Steam launch link, if they're still on the result screen, we
  // pop a non-blocking toast offering to rematch. The Steam protocol handler
  // can fail silently (uninstalled app, missing DLC, blocked URL) and there
  // was previously no path back to the vote without restarting the flow.
  useEffect(() => {
    if (!steamLaunchedAt) return
    const timer = setTimeout(() => {
      toast(t('vote.launchTimeout'), {
        description: t('vote.launchTimeoutDescription'),
        duration: 15000,
        action: {
          label: t('vote.tryAnother'),
          onClick: () => { void handleRematchRef.current() },
        },
      })
    }, 5 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [steamLaunchedAt, t])

  const canClose = session && (session.createdBy === user?.id)

  // No active session
  if (noSession) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(`/groups/${id}`)} aria-label={t('group.back')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={CircleOff}
            title={t('vote.noActiveSessionTitle')}
            description={t('vote.noActiveSessionDescription')}
            action={{
              label: t('vote.backToGroup'),
              onClick: () => navigate(`/groups/${id}`),
            }}
          />
        </main>
        <AppFooter />
      </div>
    )
  }

  // Result screen — extracted into its own component so it owns its reveal
  // choreography, focus management and reduced-motion hooks without polluting
  // the parent. The parent keeps the effects that depend on lifecycle state
  // (completedSessionRef, launch-timeout toast) since they read `session` /
  // `steamLaunchedAt`.
  if (result) {
    return (
      <ResultScreen
        result={result}
        sessionId={session?.id ?? null}
        rematching={rematching}
        onRematch={handleRematch}
        onBack={() => navigate(`/groups/${id}`)}
        onSteamLaunch={(steamAppId) => {
          setSteamLaunchedAt(Date.now())
          track('game.launched_in_steam', { steamAppId })
        }}
      />
    )
  }

  // Waiting screen (already voted)
  if (hasVoted) {
    const scheduledDate = session?.scheduledAt ? new Date(session.scheduledAt) : null
    const isScheduledSession = scheduledDate && scheduledDate.getTime() > Date.now()

    return (
      <main id="main-content" className="min-h-screen flex flex-col items-center justify-center px-3 sm:px-4 py-4">
        <Check className="w-16 h-16 text-success mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-heading font-bold mb-2">{t('vote.submitted')}</h1>

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
        <p role="status" aria-live="polite" className="text-muted-foreground mb-6">
          {t('vote.waiting', { done: voterCount, total: totalMembers })}
        </p>

        <div className="relative w-48 mb-3">
          {/* Burst a fresh set of particles each time voterCount increments —
              the changing key remounts the component so the lazy initializer
              regenerates random positions and the animation replays. */}
          {voterCount > 0 && <CelebrationParticles key={voterCount} count={10} />}
          <Progress value={voterCount} max={totalMembers} />
        </div>

        {/* Per-participant progress dots. Each dot represents one participant
            in the session and lights up once that participant has cast at
            least one vote. Lets members see *who* the session is waiting on
            instead of just the bare X/Y count. Hidden when the session has
            no participant data (legacy sessions before the junction table). */}
        {participantIds.length > 0 && (
          <div
            role="list"
            aria-label={t('vote.waiting', { done: voterCount, total: totalMembers })}
            className="mb-8 flex flex-wrap items-center justify-center gap-1.5 max-w-xs"
          >
            {participantIds.map((pid) => {
              const voted = votedUserIds.has(pid)
              return (
                <span
                  key={pid}
                  role="listitem"
                  aria-label={voted ? t('vote.participantVoted') : t('vote.participantWaiting')}
                  className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                    voted
                      ? 'bg-primary shadow-[0_0_8px_rgba(120,200,255,0.45)]'
                      : 'bg-muted-foreground/30'
                  }`}
                />
              )
            })}
          </div>
        )}

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
      </main>
    )
  }

  // Non-participant view
  if (!isParticipant) {
    return (
      <main id="main-content" className="min-h-screen flex flex-col items-center justify-center p-4">
        <Vote className="w-16 h-16 text-muted-foreground mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-heading font-bold mb-2">{t('vote.sessionInProgress')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('vote.notParticipant')}
        </p>
        <Button
          variant="ghost"
          onClick={() => navigate(`/groups/${id}`)}
        >
          {t('vote.backToGroup')}
        </Button>
      </main>
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
          <h1 className="text-xl font-heading font-bold">{t('vote.selectGamesTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('vote.selectGamesHint', { count: games.length })}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mb-4" role="search">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('group.searchGames')}
            aria-label={t('group.searchGames')}
            className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-primary/30"
          />
        </div>

        {/* Scrollable grid area: holds the sticky selection badge so users
            don't lose track of their pick count while scrolling on mobile. */}
        <div className="flex-1 overflow-y-auto pb-24">
          {/* Sticky selection counter — appears at the top of the scroll
              container as soon as the user picks at least one game. The
              floating bottom bar still shows the same count and the submit
              CTA, but on mobile the bottom bar is easily covered by the
              scrolling thumb, so this pill keeps the context visible at the
              top of the viewport. */}
          {selectedGames.size > 0 && (
            <div
              aria-hidden="true"
              className="sticky top-0 z-10 -mx-1 mb-3 flex justify-center pointer-events-none"
            >
              <span className="rounded-full border border-primary/40 bg-background/85 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                {t('vote.gamesSelected', { count: selectedGames.size })}
              </span>
            </div>
          )}
          <div role="list" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredGames.map(game => {
            const isSelected = selectedGames.has(game.steamAppId)
            return (
              <div
                key={game.steamAppId}
                role="listitem"
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 shadow-lg'
                    : 'border-border hover:border-muted-foreground/40'
                }`}
              >
                <button
                  onClick={() => toggleGame(game.steamAppId)}
                  className="w-full text-left active:scale-95 active:bg-accent/10 transition-transform"
                  aria-label={isSelected ? t('vote.deselectGame', { name: game.gameName }) : t('vote.selectGame', { name: game.gameName })}
                  aria-pressed={isSelected}
                >
                  <img
                    src={game.headerImageUrl}
                    alt={game.gameName}
                    className={`w-full aspect-[460/215] object-cover transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-90'
                    }`}
                  />
                </button>
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center pointer-events-none">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                {game.metacriticScore != null && (
                  <span className={`absolute top-1.5 left-1.5 text-xs font-bold px-1.5 py-0.5 rounded pointer-events-none ${
                    game.metacriticScore >= 75 ? 'bg-score-good text-white' :
                    game.metacriticScore >= 50 ? 'bg-score-mixed text-white' :
                    'bg-score-bad text-white'
                  }`}>
                    {game.metacriticScore}
                  </span>
                )}
                <div className="flex items-center justify-between p-2">
                  <p className="text-xs font-medium truncate flex-1 min-w-0">{game.gameName}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailGame(game)
                        }}
                        className="ml-1 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-accent/10 active:scale-95 transition-all"
                        aria-label={t('vote.gameDetails')}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t('vote.gameDetails')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )
          })}
          </div>
        </div>

        {/* Game detail dialog */}
        <GameDetailDialog
          game={detailGame}
          isSelected={detailGame ? selectedGames.has(detailGame.steamAppId) : false}
          onOpenChange={(open) => { if (!open) setDetailGame(null) }}
          onToggle={(steamAppId) => toggleGame(steamAppId)}
          t={t}
        />

        {/* Floating submit button */}
        <div className="fixed bottom-0 left-0 right-0 p-2.5 sm:p-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-sm shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {t('vote.gamesSelected', { count: selectedGames.size })}
            </span>
            <Button onClick={submitVotes} disabled={submitting || selectedGames.size === 0} aria-label={t('vote.submitSelection')} className="relative">
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t('vote.submitSelection')}
              {selectedGames.size > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {selectedGames.size}
                </span>
              )}
            </Button>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result Screen
// ---------------------------------------------------------------------------

interface ResultScreenProps {
  result: VoteResult
  sessionId: string | null
  rematching: boolean
  onRematch: () => void
  onBack: () => void
  onSteamLaunch: (steamAppId: number) => void
}

/**
 * The reveal screen — the payoff of the whole app. Sequencing is intentional:
 * eyebrow → image (spring + warm glow) → confetti burst → heading → consensus
 * bar with count-up → CTA ladder. The CTA ladder demotes "Relancer un vote"
 * to a small rescue link since rematching throws away the group's decision.
 * Everything collapses to a single fade when prefers-reduced-motion is on.
 */
function ResultScreen({
  result,
  sessionId,
  rematching,
  onRematch,
  onBack,
  onSteamLaunch,
}: ResultScreenProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion() ?? false
  const headingRef = useRef<HTMLHeadingElement>(null)

  const hasWinner = Number.isInteger(result.steamAppId) && result.steamAppId > 0
  const percent =
    result.totalVoters > 0
      ? Math.round((result.yesCount / result.totalVoters) * 100)
      : 0
  // Suppress the consensus block in the solo case — "100 % of 1" reads as
  // clinical rather than celebratory and just eats vertical space.
  const showConsensus = hasWinner && result.totalVoters > 1
  const isUnanimous = percent === 100 && result.totalVoters > 1

  // Animated count-up for the consensus percentage. Framer-motion's
  // imperative `animate` drives a React state through its onUpdate callback;
  // under reduced motion we skip the animation and show the final value
  // directly (derived during render, no setState in the effect body).
  const [animatedPercent, setAnimatedPercent] = useState(0)
  const displayPercent = shouldReduceMotion ? percent : animatedPercent
  useEffect(() => {
    if (!showConsensus || shouldReduceMotion) return
    const controls = animate(0, percent, {
      duration: 1.1,
      delay: 0.3,
      ease: 'easeOut',
      onUpdate: (v) => setAnimatedPercent(Math.round(v)),
    })
    return () => controls.stop()
  }, [percent, shouldReduceMotion, showConsensus])

  // Move focus to the heading on mount so screen reader users hear the reveal
  // as a state change instead of silently landing on a new UI.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  // One-shot celebration burst — fires after the image lands. Skipped under
  // reduced-motion and when there's no winner to celebrate.
  const [particlesVisible, setParticlesVisible] = useState(false)
  useEffect(() => {
    if (shouldReduceMotion || !hasWinner) return
    const timer = setTimeout(() => setParticlesVisible(true), 550)
    return () => clearTimeout(timer)
  }, [shouldReduceMotion, hasWinner])

  // No-winner branch: drops the hero image + consensus bar and keeps only the
  // rescue actions. Rematch is promoted to the primary button here since it's
  // the only meaningful forward motion.
  if (!hasWinner) {
    return (
      <main id="main-content" className="min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.15 : 0.4 }}
          className="text-center max-w-md"
          role="status"
          aria-live="polite"
        >
          <CircleOff
            className="w-16 h-16 mx-auto mb-4 text-muted-foreground"
            aria-hidden="true"
          />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-heading font-bold mb-2 focus:outline-none"
          >
            {t('vote.noWinner')}
          </h1>
          <p className="text-muted-foreground mb-8">
            {t('vote.noWinnerDescription')}
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button onClick={onRematch} disabled={rematching}>
              {rematching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {t('vote.rematch')}
            </Button>
            <Button variant="ghost" onClick={onBack}>
              {t('vote.backToGroup')}
            </Button>
          </div>
        </motion.div>
      </main>
    )
  }

  // Reveal choreography. Kept simple under reduced motion: no stagger, no
  // spring, no keyframes — a single 0.15s fade replaces the whole sequence.
  const container: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
        delayChildren: shouldReduceMotion ? 0 : 0.08,
      },
    },
  }

  const eyebrow: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0.15 : 0.4, ease: 'easeOut' },
    },
  }

  const imageVariants: Variants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.15 } },
      }
    : {
        hidden: { opacity: 0, scale: 0.94 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { type: 'spring', stiffness: 140, damping: 18 },
        },
      }

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.15 : 0.45,
        ease: 'easeOut',
      },
    },
  }

  const consensusText = isUnanimous
    ? t('vote.unanimous')
    : t('vote.consensusPercent', { percent: displayPercent })

  return (
    <main id="main-content" className="min-h-screen flex flex-col items-center justify-center p-4">
      <AnimatePresence>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={container}
          className="text-center max-w-md w-full"
        >
          {/* Wrap the title block in a live region so SR users get the full
              "tonight you play → game name" announcement as one payload. */}
          <div role="status" aria-live="polite" aria-atomic="true">
            <motion.p
              variants={eyebrow}
              className="text-sm text-muted-foreground mb-4 uppercase tracking-widest"
            >
              {t('vote.tonightYouPlay')}
            </motion.p>

            {result.headerImageUrl && (
              <motion.div variants={imageVariants} className="relative mb-6">
                {/* Warm reward glow that breathes around the image. The
                    cool primary rim underneath adds depth without stealing
                    focus from the orange payoff colour. */}
                <motion.div
                  aria-hidden="true"
                  className="absolute -inset-6 bg-reward/30 blur-3xl rounded-3xl pointer-events-none"
                  animate={
                    shouldReduceMotion
                      ? undefined
                      : { opacity: [0.55, 0.85, 0.55], scale: [1, 1.04, 1] }
                  }
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -inset-3 bg-primary/15 blur-2xl rounded-3xl pointer-events-none"
                />
                <img
                  src={result.headerImageUrl}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  className="relative w-full rounded-lg shadow-[0_30px_80px_-20px_oklch(0.82_0.17_70/0.45)] ring-1 ring-reward/40"
                />
                {/* Changing the key forces a fresh mount so the particle
                    generator re-randomises positions on rematch reveals. */}
                {particlesVisible && (
                  <CelebrationParticles
                    key={`result-burst-${result.steamAppId}`}
                    count={26}
                  />
                )}
              </motion.div>
            )}

            <motion.h1
              ref={headingRef}
              tabIndex={-1}
              variants={fadeUp}
              className="text-3xl font-heading font-bold mb-4 break-words text-balance focus:outline-none"
            >
              {result.gameName}
            </motion.h1>
          </div>

          {showConsensus && (
            <motion.div
              variants={fadeUp}
              className="mb-8 w-full max-w-xs mx-auto"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="tabular-nums">{consensusText}</span>
                <span className="tabular-nums">
                  {result.yesCount}/{result.totalVoters}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t('vote.consensusLabel')}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${percent}% — ${result.yesCount}/${result.totalVoters}`}
                className="h-2 w-full overflow-hidden rounded-full bg-secondary"
              >
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-reward to-amber-300 shadow-[0_0_12px_rgba(255,215,128,0.45)]"
                  initial={{ width: '0%' }}
                  animate={{ width: `${percent}%` }}
                  transition={{
                    duration: shouldReduceMotion ? 0.15 : 1.1,
                    delay: shouldReduceMotion ? 0 : 0.3,
                    ease: 'easeOut',
                  }}
                />
              </div>
            </motion.div>
          )}

          {/* CTA ladder — Launch is the hero. Share + Back are equal-weight
              siblings on the row below. Rematch is demoted to a small text
              link because it throws away the group's decision, so it should
              read as a rescue hatch rather than a competing call-to-action. */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      boxShadow: [
                        '0 0 0 0 rgba(102,192,244,0)',
                        '0 0 0 10px rgba(102,192,244,0.18)',
                        '0 0 0 0 rgba(102,192,244,0)',
                      ],
                    }
              }
              transition={{
                duration: 2.8,
                repeat: Infinity,
                delay: 2.2,
                ease: 'easeInOut',
              }}
              className="rounded-lg"
            >
              <Button
                variant="steam"
                size="lg"
                asChild
                className="h-14 px-10 text-base"
              >
                <a
                  href={`steam://run/${result.steamAppId}`}
                  className="gap-2"
                  onClick={() => onSteamLaunch(result.steamAppId)}
                >
                  <ExternalLink className="w-5 h-5" />
                  {t('vote.launchSteam')}
                </a>
              </Button>
            </motion.div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              {sessionId && (
                <ShareButton
                  sessionId={sessionId}
                  title={result.gameName}
                  description={t('vote.shareDescription', {
                    count: result.yesCount,
                    title: result.gameName,
                  })}
                  variant="outline"
                  size="sm"
                />
              )}
              <Button variant="ghost" size="sm" onClick={onBack}>
                {t('vote.backToGroup')}
              </Button>
            </div>

            <button
              type="button"
              onClick={onRematch}
              disabled={rematching}
              className="mt-1 inline-flex items-center gap-1.5 px-2 py-2 min-h-[44px] text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-dotted rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rematching ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t('vote.rematch')}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Game Detail Dialog
// ---------------------------------------------------------------------------

interface GameDetailDialogProps {
  game: Game | null
  isSelected: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (steamAppId: number) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function GameDetailDialog({ game, isSelected, onOpenChange, onToggle, t }: GameDetailDialogProps) {
  if (!game) return null

  const steamStoreUrl = `https://store.steampowered.com/app/${game.steamAppId}`

  return (
    <ResponsiveDialog open={!!game} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{game.gameName}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('vote.gameDetailsFor', { name: game.gameName })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Header image */}
        <img
          src={game.headerImageUrl}
          alt={game.gameName}
          className="w-full rounded-lg aspect-[460/215] object-cover"
        />

        {/* Metadata badges row */}
        <div className="flex flex-wrap gap-2">
          {/* Metacritic */}
          {game.metacriticScore != null && (
            <Badge
              variant="outline"
              className={`gap-1 ${
                game.metacriticScore >= 75 ? 'border-score-good text-score-good' :
                game.metacriticScore >= 50 ? 'border-score-mixed text-score-mixed' :
                'border-score-bad text-score-bad'
              }`}
            >
              <Star className="w-3 h-3" />
              Metacritic {game.metacriticScore}
            </Badge>
          )}

          {/* Free badge */}
          {game.isFree && (
            <Badge variant="secondary" className="bg-score-good/10 text-score-good border-score-good/20">
              {t('vote.free')}
            </Badge>
          )}

          {/* Controller support */}
          {game.controllerSupport && (
            <Badge variant="secondary" className="gap-1">
              <Gamepad2 className="w-3 h-3" />
              {t('vote.controllerSupport', { level: game.controllerSupport })}
            </Badge>
          )}

          {/* Release date */}
          {game.releaseDate && (
            <Badge variant="outline">
              {game.releaseDate}
            </Badge>
          )}
        </div>

        {/* Platforms */}
        {game.platforms && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t('vote.platforms')}:</span>
            <div className="flex gap-2">
              {game.platforms.windows && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Monitor className="w-3.5 h-3.5" />
                  Windows
                </span>
              )}
              {game.platforms.mac && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Apple className="w-3.5 h-3.5" />
                  Mac
                </span>
              )}
              {game.platforms.linux && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Monitor className="w-3.5 h-3.5" />
                  Linux
                </span>
              )}
            </div>
          </div>
        )}

        {/* Genres */}
        {game.genres && game.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {game.genres.map(genre => (
              <Badge key={genre.id} variant="secondary" className="text-xs">
                {genre.description}
              </Badge>
            ))}
          </div>
        )}

        {/* Short description */}
        {game.shortDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {decodeHtmlEntities(game.shortDescription)}
          </p>
        )}

        {/* Footer actions */}
        <ResponsiveDialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="gap-1.5"
          >
            <a href={steamStoreUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              {t('vote.viewOnSteam')}
            </a>
          </Button>

          <Button
            variant={isSelected ? 'secondary' : 'default'}
            size="sm"
            onClick={() => onToggle(game.steamAppId)}
            className="gap-1.5"
          >
            <Check className={`w-4 h-4 ${isSelected ? '' : 'opacity-0'}`} />
            {isSelected ? t('vote.deselect') : t('vote.select')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
