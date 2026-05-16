import { useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { GameThumb } from '@/components/game-thumb'
import { PremiumGate } from '@/components/premium-gate'
import { api } from '@/lib/api'

interface Recommendation {
  gameName: string
  steamAppId: number
  headerImageUrl: string
  reason: string
}

interface GameRecommendationsProps {
  groupId: string
}

export function GameRecommendations({ groupId }: GameRecommendationsProps) {
  const { t } = useTranslation()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loaded, setLoaded] = useState(false)
  const [trackedGroup, setTrackedGroup] = useState(groupId)

  // Reset to the loading state when the group changes (see GroupStats).
  if (groupId !== trackedGroup) {
    setTrackedGroup(groupId)
    setRecommendations([])
    setLoaded(false)
  }

  useEffect(() => {
    let cancelled = false
    api.getRecommendations(groupId)
      .then((data) => {
        if (cancelled) return
        setRecommendations(data.recommendations)
        setLoaded(true)
      })
      .catch(() => {
        // Non-critical (includes premium_required 403). Mark loaded so the
        // empty state shows instead of an endless skeleton.
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [groupId])

  // The common "never played together" case uses the quietest variant so a
  // uniform list reads calmly; the rarer, more actionable reasons stand out.
  const reasonBadge = (reason: string) => {
    switch (reason) {
      case 'never_played':
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.neverPlayed')}</Badge>
      case 'not_played_long':
        return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.notPlayedLong')}</Badge>
      case 'popular_forgotten':
        return <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.popularForgotten')}</Badge>
      default:
        return null
    }
  }

  return (
    <CollapsibleCard title={t('recommendations.title')} icon={Lightbulb}>
      <PremiumGate from="recommendations">
        {!loaded ? (
          <div className="space-y-2">
            <Skeleton className="h-[34px]" />
            <Skeleton className="h-[34px]" />
            <Skeleton className="h-[34px]" />
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Lightbulb className="size-8 text-muted-foreground/40 mb-1" aria-hidden="true" />
            <p className="text-sm font-medium">{t('recommendations.emptyTitle')}</p>
            <p className="text-xs text-muted-foreground max-w-[16rem]">{t('recommendations.emptyDescription')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recommendations.map((game) => (
              <div key={game.steamAppId} className="flex items-center gap-3">
                <GameThumb
                  appId={game.steamAppId}
                  name={game.gameName}
                  src={game.headerImageUrl}
                  className="w-16 h-[34px]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={game.gameName}>{game.gameName}</p>
                  {reasonBadge(game.reason)}
                </div>
              </div>
            ))}
          </div>
        )}
      </PremiumGate>
    </CollapsibleCard>
  )
}
