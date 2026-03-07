import { useMemo, useState } from 'react'
import { Search, X, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface Game {
  steamAppId: number
  gameName: string
  headerImageUrl: string
  ownerCount: number
  totalMembers: number
}

interface GameGridProps {
  games: Game[]
  loading: boolean
  multiplayerOnly: boolean
  onToggleMultiplayer: (value: boolean) => void
}

const DISPLAY_CAP = 50

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function GameGrid({ games, loading, multiplayerOnly, onToggleMultiplayer }: GameGridProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filteredGames = useMemo(() => {
    if (searchQuery.trim() === '') return games
    const q = normalize(searchQuery)
    return games.filter((g) => normalize(g.gameName).includes(q))
  }, [games, searchQuery])

  const isFiltering = searchQuery.trim().length > 0
  const displayedGames = isFiltering || showAll
    ? filteredGames
    : filteredGames.slice(0, DISPLAY_CAP)
  const hasMore = !isFiltering && !showAll && filteredGames.length > DISPLAY_CAP

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">
          {isFiltering
            ? t('group.commonGamesFiltered', { filtered: filteredGames.length, total: games.length })
            : t('group.commonGames', { count: games.length })}
        </h2>
      </div>

      {!loading && games.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1" role="search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('group.searchGames')}
              aria-label={t('group.searchGames')}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('group.clearSearch')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            variant={multiplayerOnly ? 'default' : 'secondary'}
            size="sm"
            onClick={() => onToggleMultiplayer(!multiplayerOnly)}
            className="shrink-0 gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            {t('group.multiplayerOnly')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="w-full aspect-[460/215] rounded" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('group.noCommonGames')}
        </p>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">{t('group.noSearchResults')}</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-sm text-primary hover:underline mt-1"
          >
            {t('group.clearSearch')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {displayedGames.map((game) => (
              <div key={game.steamAppId} className="relative group" style={{ transition: 'opacity 150ms ease' }}>
                <img
                  src={game.headerImageUrl}
                  alt={game.gameName}
                  width={460}
                  height={215}
                  className="w-full rounded aspect-[460/215] object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent rounded flex items-end p-2">
                  <span className="text-xs font-medium text-white leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{game.gameName}</span>
                </div>
                {game.ownerCount < game.totalMembers && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="absolute top-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-help">
                        <Users className="w-2.5 h-2.5" />
                        {game.ownerCount}/{game.totalMembers}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('group.ownerCountHint', { owned: game.ownerCount, total: game.totalMembers })}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
          {hasMore && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => setShowAll(true)}
            >
              {t('group.showAll', { count: filteredGames.length })}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
