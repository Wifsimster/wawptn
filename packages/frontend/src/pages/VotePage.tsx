import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink, Loader2, RefreshCw, Vote, Search, Send, Info, Monitor, Apple, Gamepad2, Star, CircleOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
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

  const canClose = session && (session.createdBy === user?.id)
  const prefersReducedMotion = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []
  )

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

  // Result screen
  if (result) {
    const resultStagger = {
      visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.15 } },
    }
    const resultFade = {
      hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
      visible: { opacity: 1, y: 0, transition: { duration: prefersReducedMotion ? 0.2 : 0.5 } },
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <AnimatePresence>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={resultStagger}
            className="text-center max-w-md w-full"
          >
            <motion.p variants={resultFade} className="text-sm text-muted-foreground mb-4 uppercase tracking-widest">{t('vote.tonightYouPlay')}</motion.p>
            {result.headerImageUrl && (
              <motion.div
                variants={resultFade}
                className="relative mb-6"
              >
                {/* Reward glow behind the image */}
                <div className="absolute -inset-4 bg-reward/20 blur-3xl rounded-3xl pointer-events-none" aria-hidden="true" />
                <img
                  src={result.headerImageUrl}
                  alt={result.gameName}
                  className="relative w-full rounded-lg shadow-2xl ring-1 ring-reward/20"
                />
              </motion.div>
            )}
            <motion.h1 variants={resultFade} className="text-3xl font-heading font-bold mb-2">{result.gameName}</motion.h1>
            <motion.p variants={resultFade} className="text-muted-foreground mb-8">
              {t('vote.votedFor', { yes: result.yesCount, total: result.totalVoters })}
            </motion.p>

            <motion.div variants={resultFade}>
              {Number.isInteger(result.steamAppId) && result.steamAppId > 0 && (
                <Button variant="steam" size="lg" asChild>
                  <a href={`steam://run/${result.steamAppId}`} className="gap-2">
                    <ExternalLink className="w-5 h-5" />
                    {t('vote.launchSteam')}
                  </a>
                </Button>
              )}

              <Button
                variant="secondary"
                className="block mx-auto mt-4"
                onClick={handleRematch}
                disabled={rematching}
              >
                {rematching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {t('vote.rematch')}
              </Button>

              <Button
                variant="ghost"
                className="block mx-auto mt-4"
                onClick={() => navigate(`/groups/${id}`)}
              >
                {t('vote.backToGroup')}
              </Button>
            </motion.div>
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
        <h2 className="text-2xl font-heading font-bold mb-2">{t('vote.submitted')}</h2>

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
        <h2 className="text-2xl font-heading font-bold mb-2">{t('vote.sessionInProgress')}</h2>
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
          <h2 className="text-xl font-heading font-bold">{t('vote.selectGamesTitle')}</h2>
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
        <div role="list" className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 overflow-y-auto pb-24">
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
                  className="w-full text-left"
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
                        className="ml-1 shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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

        {/* Game detail dialog */}
        <GameDetailDialog
          game={detailGame}
          isSelected={detailGame ? selectedGames.has(detailGame.steamAppId) : false}
          onOpenChange={(open) => { if (!open) setDetailGame(null) }}
          onToggle={(steamAppId) => toggleGame(steamAppId)}
          t={t}
        />

        {/* Floating submit button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-sm border-t border-border">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {t('vote.gamesSelected', { count: selectedGames.size })}
            </span>
            <Button onClick={submitVotes} disabled={submitting || selectedGames.size === 0} aria-label={t('vote.submitSelection')}>
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
      <AppFooter />
    </div>
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
            {game.shortDescription}
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
