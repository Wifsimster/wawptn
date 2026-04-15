import { useMemo } from 'react'
import { Vote, Dices, Sparkles, Star, Users, Trophy, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CommonGame } from '@wawptn/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { decodeHtmlEntities } from '@/lib/utils'

interface Member {
  id: string
  displayName: string
  avatarUrl: string
}

interface VoteHistoryEntry {
  winningGameAppId: number
  winningGameName: string
  closedAt: string
}

interface TonightPickHeroProps {
  games: CommonGame[]
  loading: boolean
  voteHistory: VoteHistoryEntry[]
  members: Member[]
  onStartVote: () => void
  onRandomPick: () => void
  /**
   * If a voting session is already open for this group, the hero renders a
   * "join existing vote" variant instead of the normal "start a vote" CTA.
   * The backend enforces one open session per group, so surfacing this at
   * the group detail page prevents users from walking through the setup
   * dialog only to land on a 409 toast on the vote page.
   */
  activeVoteSession?: { id: string; scheduledAt: string | null } | null
  onJoinActiveVote?: () => void
}

type PickReason = 'neverPlayed' | 'topRated' | 'mostOwned' | 'comeback'

interface ScoredPick {
  game: CommonGame
  score: number
  reason: PickReason
}

/**
 * Client-side scorer for "Tonight's Pick". Deliberately simple and
 * deterministic so it works on the free tier without any backend call —
 * the premium recommendations endpoint remains the richer alternative
 * surfaced in the sidebar. Signals used:
 *   - ownership ratio (how many members own it)
 *   - metacritic (quality bump, generous default when missing)
 *   - log-scaled recommendations (popularity)
 *   - novelty penalty if the game won recently (so we don't suggest
 *     the same thing two nights in a row)
 *   - small bonus for MP/coop since this is a group product
 */
function scoreGames(games: CommonGame[], history: VoteHistoryEntry[]): ScoredPick | null {
  if (games.length === 0) return null

  // Build a quick lookup of games won in the last ~14 days so we can
  // penalize the "same game every night" pattern.
  const now = Date.now()
  const recentWinPenalty = new Map<number, number>()
  const everPlayedIds = new Set<number>()
  for (const h of history) {
    everPlayedIds.add(h.winningGameAppId)
    const ageDays = (now - new Date(h.closedAt).getTime()) / 86_400_000
    if (ageDays <= 14) {
      // Linear decay from 0.8 (just won) to 0 (14 days ago).
      recentWinPenalty.set(h.winningGameAppId, Math.max(0, 0.8 * (1 - ageDays / 14)))
    }
  }

  let best: ScoredPick | null = null
  for (const game of games) {
    const ownership = game.totalMembers > 0 ? game.ownerCount / game.totalMembers : 0
    const mc = game.metacriticScore ?? 65 // generous default for unknowns
    const reco = game.recommendationsTotal ?? 0
    const mpBonus = (game.isMultiplayer || game.isCoop) ? 0.25 : 0

    const score =
      1.5 * ownership +
      0.8 * (mc / 100) +
      0.7 * (Math.log1p(reco) / Math.log(100_000)) +
      mpBonus -
      (recentWinPenalty.get(game.steamAppId) ?? 0)

    if (!best || score > best.score) {
      let reason: PickReason = 'mostOwned'
      if (!everPlayedIds.has(game.steamAppId)) reason = 'neverPlayed'
      else if (mc >= 85) reason = 'topRated'
      else if ((recentWinPenalty.get(game.steamAppId) ?? 0) === 0 && everPlayedIds.has(game.steamAppId)) reason = 'comeback'

      best = { game, score, reason }
    }
  }

  return best
}

const REASON_META: Record<PickReason, { key: string; icon: typeof Sparkles }> = {
  neverPlayed: { key: 'tonightPick.reasonNever', icon: Sparkles },
  topRated: { key: 'tonightPick.reasonTopRated', icon: Star },
  mostOwned: { key: 'tonightPick.reasonMostOwned', icon: Users },
  comeback: { key: 'tonightPick.reasonComeback', icon: Trophy },
}

function resolveHeaderImage(game: CommonGame): string {
  return (
    game.headerImageUrl ||
    `https://cdn.akamai.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`
  )
}

export function TonightPickHero({
  games,
  loading,
  voteHistory,
  members,
  onStartVote,
  onRandomPick,
  activeVoteSession,
  onJoinActiveVote,
}: TonightPickHeroProps) {
  const { t } = useTranslation()
  const pick = useMemo(() => scoreGames(games, voteHistory), [games, voteHistory])

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <Skeleton className="w-full h-[220px] sm:h-[260px]" />
      </div>
    )
  }

  // A vote is already open for this group → show a dedicated "join" hero
  // instead of the normal pick, since creating another vote would just
  // bounce off the backend's one-open-session-per-group guard. We key
  // the "scheduled" vs "in progress" copy off the presence of a
  // `scheduledAt` timestamp rather than comparing against `Date.now()` to
  // keep the render pure — the VotePage itself handles countdown vs live
  // display once the user clicks through.
  if (activeVoteSession && onJoinActiveVote) {
    const isScheduled = !!activeVoteSession.scheduledAt
    const avatars = members.slice(0, 5)
    return (
      <div className="relative overflow-hidden rounded-xl border border-primary/40 bg-card/40 ring-1 ring-primary/20">
        {/* Soft animated glow to draw attention away from the regular hero. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent pointer-events-none"
        />
        <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-5 items-start sm:items-center">
          <div className="shrink-0 w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
            <Vote className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[11px] uppercase tracking-wider text-primary font-bold">
                {t('tonightPick.voteInProgressEyebrow')}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-heading font-bold leading-tight">
              {isScheduled
                ? t('tonightPick.voteScheduledTitle')
                : t('tonightPick.voteInProgressTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isScheduled
                ? t('tonightPick.voteScheduledDescription')
                : t('tonightPick.voteInProgressDescription')}
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto">
            <Button
              onClick={onJoinActiveVote}
              className="h-11 px-5 gap-2 font-heading font-bold text-base shrink-0 card-hover-glow w-full sm:w-auto"
            >
              <Vote className="w-4 h-4" />
              {t('group.joinActiveVote')}
            </Button>
            {members.length > 0 && (
              <div className="flex -space-x-2 self-center sm:self-end">
                {avatars.map((member) => (
                  <Avatar key={member.id} className="w-6 h-6 ring-2 ring-background">
                    <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                    <AvatarFallback className="text-[10px]">
                      {member.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {members.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[9px] text-muted-foreground font-medium">
                    +{members.length - 5}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // No games available → minimal hero that still offers the primary CTA.
  if (!pick) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {t('tonightPick.eyebrow')}
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-heading font-bold mb-1">
          {t('tonightPick.emptyTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{t('tonightPick.emptyDescription')}</p>
        <Button onClick={onStartVote} className="w-full sm:w-auto h-11 px-6">
          <Vote className="w-4 h-4 mr-2" />
          {t('group.startVote')}
        </Button>
      </div>
    )
  }

  const { game, reason } = pick
  const ReasonIcon = REASON_META[reason].icon
  const ownershipComplete = game.ownerCount === game.totalMembers
  // Avatars — prefer stable slice so the display is deterministic.
  const avatars = members.slice(0, 5)

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card/40 group">
      {/* Background art: the Steam header, heavily masked. The image is
          absolute so the content below stays readable on any screen size. */}
      <div className="absolute inset-0">
        <img
          src={resolveHeaderImage(game)}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity duration-500 group-hover:scale-[1.02] motion-safe:transition-transform"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
      </div>

      <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch">
        {/* Left: small game thumb — kept as a visible card so users see the
            actual Steam art sharply (background is too faded to count). */}
        <div className="shrink-0 hidden sm:block">
          <img
            src={resolveHeaderImage(game)}
            alt={game.gameName}
            className="w-[200px] aspect-[460/215] rounded-lg object-cover ring-1 ring-white/10 shadow-lg"
            loading="eager"
          />
        </div>

        {/* Right: reason + title + meta + CTA */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] uppercase tracking-wider text-primary font-bold">
                {t('tonightPick.eyebrow')}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-heading font-bold leading-tight truncate">
              {game.gameName}
            </h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="gap-1 text-[11px] px-2 py-0.5">
                <ReasonIcon className="w-3 h-3" />
                {t(REASON_META[reason].key)}
              </Badge>
              {game.metacriticScore !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded cursor-default ${
                        game.metacriticScore >= 75
                          ? 'bg-score-good text-white'
                          : game.metacriticScore >= 50
                            ? 'bg-score-mixed text-white'
                            : 'bg-score-bad text-white'
                      }`}
                      aria-label={t('group.metacriticTooltip', { score: game.metacriticScore })}
                    >
                      {game.metacriticScore}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {t('group.metacriticTooltip', { score: game.metacriticScore })}
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {ownershipComplete
                  ? t('tonightPick.everyoneOwns')
                  : t('group.ownerCountHint', { owned: game.ownerCount, total: game.totalMembers })}
              </span>
            </div>
            {game.shortDescription && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 hidden sm:block">
                {decodeHtmlEntities(game.shortDescription)}
              </p>
            )}
          </div>

          {/* CTA row: dominant primary + small dice secondary + member avatars */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button
              onClick={onStartVote}
              className="h-11 px-5 gap-2 font-heading font-bold text-base shrink-0 card-hover-glow"
            >
              <Vote className="w-4 h-4" />
              {t('group.startVote')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={onRandomPick}
                  className="h-11 w-11 shrink-0"
                  aria-label={t('group.randomPick')}
                >
                  <Dices className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('group.randomPick')}</TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-2 min-w-0 ml-auto">
              <div className="flex -space-x-2">
                {avatars.map((member) => (
                  <Avatar key={member.id} className="w-7 h-7 ring-2 ring-background">
                    <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                    <AvatarFallback className="text-[10px]">
                      {member.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {members.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                    +{members.length - 5}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground hidden md:inline-flex items-center gap-1">
                <Zap className="w-3 h-3 text-primary" />
                {t('tonightPick.ready')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
