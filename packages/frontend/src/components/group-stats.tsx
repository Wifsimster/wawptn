import { useEffect, useState } from 'react'
import { BarChart3, Trophy, Users, Vote, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { GameThumb } from '@/components/game-thumb'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface GroupStatsData {
  totalSessions: number
  totalVotes: number
  topGames: { gameName: string; steamAppId: number; winCount: number; totalNominations: number }[]
  memberParticipation: { userId: string; displayName: string; avatarUrl: string; voteCount: number; sessionsParticipated: number }[]
  recentWinners: { gameName: string; steamAppId: number; closedAt: string }[]
}

type Status = 'loading' | 'error' | 'ready'

interface GroupStatsProps {
  groupId: string
}

const SECTION_LABEL =
  'text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5'

export function GroupStats({ groupId }: GroupStatsProps) {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<GroupStatsData | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [request, setRequest] = useState(0)
  const [trackedGroup, setTrackedGroup] = useState(groupId)

  // Reset to the loading state when the group changes, so a stale group's
  // stats never flash before the new fetch resolves.
  if (groupId !== trackedGroup) {
    setTrackedGroup(groupId)
    setStats(null)
    setStatus('loading')
  }

  useEffect(() => {
    let cancelled = false
    api.getGroupStats(groupId)
      .then((data) => {
        if (cancelled) return
        setStats(data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => { cancelled = true }
  }, [groupId, request])

  return (
    <CollapsibleCard title={t('stats.title')} icon={BarChart3}>
      {status === 'loading' && <StatsSkeleton />}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">{t('stats.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => { setStatus('loading'); setRequest((n) => n + 1) }}>
            <RefreshCw className="size-4 mr-1.5" aria-hidden="true" />
            {t('common.retry')}
          </Button>
        </div>
      )}

      {status === 'ready' && stats && (
        stats.totalSessions === 0
          ? <StatsEmpty />
          : <StatsContent stats={stats} language={i18n.language} />
      )}
    </CollapsibleCard>
  )
}

function StatsContent({ stats, language }: { stats: GroupStatsData; language: string }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Summary counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
          <Vote className="size-5 text-primary shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold leading-tight text-primary">{stats.totalSessions}</p>
            <p className="text-xs text-muted-foreground">{t('stats.sessions')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
          <BarChart3 className="size-5 text-primary shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold leading-tight text-primary">{stats.totalVotes}</p>
            <p className="text-xs text-muted-foreground">{t('stats.votes')}</p>
          </div>
        </div>
      </div>

      {/* Top games */}
      {stats.topGames.length > 0 && (
        <div className="space-y-2">
          <h3 className={SECTION_LABEL}>
            <Trophy className="size-3.5" aria-hidden="true" />
            {t('stats.topGames')}
          </h3>
          <div className="space-y-1.5">
            {stats.topGames.map((game, index) => {
              const winRate = game.totalNominations > 0
                ? Math.round((game.winCount / game.totalNominations) * 100)
                : null
              return (
                <div key={game.steamAppId} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'text-sm font-bold w-4 text-right shrink-0',
                      index === 0 ? 'text-reward' : 'text-muted-foreground',
                    )}
                  >
                    {index + 1}
                  </span>
                  <GameThumb appId={game.steamAppId} name={game.gameName} className="w-14 h-[26px]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" title={game.gameName}>{game.gameName}</p>
                    {winRate !== null && (
                      <p className="text-xs text-muted-foreground">{t('stats.winRate', { rate: winRate })}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {game.winCount} {game.winCount > 1 ? t('stats.wins') : t('stats.win')}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Member participation */}
      {stats.memberParticipation.length > 0 && (
        <div className="space-y-2">
          <h3 className={SECTION_LABEL}>
            <Users className="size-3.5" aria-hidden="true" />
            {t('stats.participation')}
          </h3>
          <div className="space-y-1.5">
            {stats.memberParticipation.map((member) => (
              <div key={member.userId} className="flex items-center gap-2.5">
                <Avatar className="size-6 shrink-0">
                  <AvatarImage src={member.avatarUrl} alt="" />
                  <AvatarFallback className="text-xs">{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm truncate flex-1" title={member.displayName}>{member.displayName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {t('stats.memberVotes', { count: member.voteCount })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent winners */}
      {stats.recentWinners.length > 0 && (
        <div className="space-y-2">
          <h3 className={SECTION_LABEL}>
            <Trophy className="size-3.5" aria-hidden="true" />
            {t('stats.recentWinners')}
          </h3>
          <div className="space-y-1.5">
            {stats.recentWinners.map((winner, index) => (
              <div key={`${winner.steamAppId}-${index}`} className="flex items-center gap-2.5">
                <GameThumb appId={winner.steamAppId} name={winner.gameName} className="w-14 h-[26px]" />
                <span className="text-sm truncate flex-1" title={winner.gameName}>{winner.gameName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(winner.closedAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[58px]" />
        <Skeleton className="h-[58px]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7" />
        <Skeleton className="h-7" />
      </div>
    </div>
  )
}

function StatsEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
      <BarChart3 className="size-8 text-muted-foreground/40 mb-1" aria-hidden="true" />
      <p className="text-sm font-medium">{t('stats.emptyTitle')}</p>
      <p className="text-xs text-muted-foreground max-w-[16rem]">{t('stats.emptyDescription')}</p>
    </div>
  )
}
