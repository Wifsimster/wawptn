import { useEffect, useRef, useState } from 'react'
import { BarChart3, Trophy, Users, Vote, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

interface GroupStatsData {
  totalSessions: number
  totalVotes: number
  topGames: { gameName: string; steamAppId: number; winCount: number; totalNominations: number }[]
  memberParticipation: { userId: string; displayName: string; avatarUrl: string; voteCount: number; sessionsParticipated: number }[]
  recentWinners: { gameName: string; steamAppId: number; closedAt: string }[]
}

interface GroupStatsProps {
  groupId: string
  compact?: boolean
}

export function GroupStats({ groupId, compact = false }: GroupStatsProps) {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<GroupStatsData | null>(null)
  const [expanded, setExpanded] = useState(false)
  const fetchedGroupId = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchedGroupId.current = groupId
    api.getGroupStats(groupId)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        // Non-critical, fail silently
      })
    return () => { cancelled = true }
  }, [groupId])

  if (!stats || stats.totalSessions === 0) return null

  const content = (
    <div className="space-y-4">
      {/* Summary counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2.5">
          <Vote className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalSessions}</p>
            <p className="text-xs text-muted-foreground">{t('stats.sessions')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2.5">
          <BarChart3 className="w-4 h-4 text-primary shrink-0" />
          <div>
            <p className="text-lg font-bold leading-tight">{stats.totalVotes}</p>
            <p className="text-xs text-muted-foreground">{t('stats.votes')}</p>
          </div>
        </div>
      </div>

      {/* Top games */}
      {stats.topGames.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            {t('stats.topGames')}
          </h3>
          <div className="space-y-1.5">
            {stats.topGames.map((game, index) => (
              <div key={game.steamAppId} className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-muted-foreground w-4 text-right shrink-0">
                  {index + 1}.
                </span>
                <img
                  src={`https://cdn.akamai.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`}
                  alt={game.gameName}
                  className="w-12 h-[22px] rounded object-cover shrink-0"
                  loading="lazy"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm truncate flex-1">{game.gameName}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {game.gameName}
                  </TooltipContent>
                </Tooltip>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {game.winCount} {game.winCount > 1 ? t('stats.wins') : t('stats.win')}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member participation */}
      {stats.memberParticipation.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {t('stats.participation')}
          </h3>
          <div className="space-y-1.5">
            {stats.memberParticipation.map((member) => (
              <div key={member.userId} className="flex items-center gap-2.5">
                <Avatar className="w-6 h-6 shrink-0">
                  <AvatarImage src={member.avatarUrl} alt={member.displayName} />
                  <AvatarFallback className="text-xs">{member.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm truncate flex-1">{member.displayName}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {member.displayName}
                  </TooltipContent>
                </Tooltip>
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
          <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" />
            {t('stats.recentWinners')}
          </h3>
          <div className="space-y-1.5">
            {stats.recentWinners.map((winner, index) => (
              <div key={`${winner.steamAppId}-${index}`} className="flex items-center gap-2.5">
                <img
                  src={`https://cdn.akamai.steamstatic.com/steam/apps/${winner.steamAppId}/header.jpg`}
                  alt={winner.gameName}
                  className="w-12 h-[22px] rounded object-cover shrink-0"
                  loading="lazy"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm truncate flex-1">{winner.gameName}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {winner.gameName}
                  </TooltipContent>
                </Tooltip>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(winner.closedAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="w-full flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4" />
            {t('stats.title')}
          </h2>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {expanded && content}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="w-full flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4" />
            {t('stats.title')}
          </h2>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          {content}
        </CardContent>
      )}
    </Card>
  )
}
