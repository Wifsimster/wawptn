import { useEffect, useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  compact?: boolean
}

export function GameRecommendations({ groupId, compact = false }: GameRecommendationsProps) {
  const { t } = useTranslation()
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const fetchedGroupId = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchedGroupId.current = groupId
    api.getRecommendations(groupId)
      .then((data) => {
        if (!cancelled) setRecommendations(data.recommendations)
      })
      .catch(() => {
        // Non-critical, fail silently (includes premium_required 403)
      })
    return () => { cancelled = true }
  }, [groupId])

  const reasonBadge = (reason: string) => {
    switch (reason) {
      case 'never_played':
        return <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.neverPlayed')}</Badge>
      case 'not_played_long':
        return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.notPlayedLong')}</Badge>
      case 'popular_forgotten':
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{t('recommendations.popularForgotten')}</Badge>
      default:
        return null
    }
  }

  const wrapper = (content: React.ReactNode) => {
    if (compact) {
      return (
        <div className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Lightbulb className="size-4" />
            {t('recommendations.title')}
          </h2>
          {content}
        </div>
      )
    }
    return (
      <Card>
        <CardHeader className="pb-3">
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Lightbulb className="size-4" />
            {t('recommendations.title')}
          </h2>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    )
  }

  return wrapper(
    <PremiumGate from="recommendations">
      {recommendations.length === 0 ? null : (
        <div className="space-y-2">
          {recommendations.map((game) => (
            <div key={game.steamAppId} className="flex items-center gap-3">
              <img
                src={game.headerImageUrl}
                alt={game.gameName}
                className="w-16 h-[34px] rounded-md object-cover shrink-0"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{game.gameName}</p>
                {reasonBadge(game.reason)}
              </div>
            </div>
          ))}
        </div>
      )}
    </PremiumGate>
  )
}
