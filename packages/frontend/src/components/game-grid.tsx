import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, X, Users, Handshake, Star, ChevronDown, Gamepad2, Monitor, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface Game {
  steamAppId: number
  gameName: string
  headerImageUrl: string
  ownerCount: number
  totalMembers: number
  genres: { id: string; description: string }[] | null
  metacriticScore: number | null
  type: string | null
  shortDescription: string | null
  platforms: { windows: boolean; mac: boolean; linux: boolean } | null
  recommendationsTotal: number | null
  releaseDate: string | null
  comingSoon: boolean | null
  controllerSupport: string | null
  isFree: boolean | null
}

export interface GameFilters {
  multiplayerOnly: boolean
  coopOnly: boolean
  selectedGenres: string[]
  minMetacritic: number | null
  gamesOnly: boolean
  controllerOnly: boolean
  platform: 'all' | 'windows' | 'mac' | 'linux'
  sortBy: 'owners' | 'popularity' | 'name'
}

interface GameGridProps {
  games: Game[]
  loading: boolean
  filters: GameFilters
  onToggleMultiplayer: (value: boolean) => void
  onToggleCoop: (value: boolean) => void
  onToggleGenre: (genre: string) => void
  onSetMinMetacritic: (value: number | null) => void
  onToggleGamesOnly: (value: boolean) => void
  onToggleControllerOnly: (value: boolean) => void
  onSetPlatform: (value: 'all' | 'windows' | 'mac' | 'linux') => void
  onSetSortBy: (value: 'owners' | 'popularity' | 'name') => void
  onResetFilters: () => void
}

const DISPLAY_CAP = 50
const VIRTUALIZE_THRESHOLD = 100

const METACRITIC_THRESHOLDS = [null, 60, 70, 75, 80, 85, 90] as const

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function GameGrid({ games, loading, filters, onToggleMultiplayer, onToggleCoop, onToggleGenre, onSetMinMetacritic, onToggleGamesOnly, onToggleControllerOnly, onSetPlatform, onSetSortBy, onResetFilters }: GameGridProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [genreExpanded, setGenreExpanded] = useState(false)

  // Collect all unique genres from games
  const availableGenres = useMemo(() => {
    const genreSet = new Map<string, string>()
    for (const game of games) {
      if (game.genres) {
        for (const g of game.genres) {
          genreSet.set(g.id, g.description)
        }
      }
    }
    return Array.from(genreSet.entries())
      .map(([id, description]) => ({ id, description }))
      .sort((a, b) => a.description.localeCompare(b.description))
  }, [games])

  const filteredGames = useMemo(() => {
    let result = games

    // Text search
    if (searchQuery.trim() !== '') {
      const q = normalize(searchQuery)
      result = result.filter((g) => normalize(g.gameName).includes(q))
    }

    // Games only (exclude DLC, software, etc.)
    if (filters.gamesOnly) {
      result = result.filter((g) => !g.type || g.type === 'game')
    }

    // Platform filter
    if (filters.platform !== 'all') {
      const plat = filters.platform
      result = result.filter((g) => {
        if (!g.platforms) return true // keep un-enriched games
        return g.platforms[plat]
      })
    }

    // Controller support
    if (filters.controllerOnly) {
      result = result.filter((g) => g.controllerSupport === 'full' || g.controllerSupport === 'partial')
    }

    // Genre filter (client-side)
    if (filters.selectedGenres.length > 0) {
      result = result.filter((g) => {
        if (!g.genres) return false
        const gameGenreIds = g.genres.map(genre => genre.id)
        return filters.selectedGenres.some(id => gameGenreIds.includes(id))
      })
    }

    // Metacritic filter (client-side)
    if (filters.minMetacritic !== null) {
      result = result.filter((g) => {
        if (g.metacriticScore === null) return false
        return g.metacriticScore >= filters.minMetacritic!
      })
    }

    // Sorting
    if (filters.sortBy === 'popularity') {
      result = [...result].sort((a, b) => (b.recommendationsTotal ?? 0) - (a.recommendationsTotal ?? 0))
    } else if (filters.sortBy === 'name') {
      result = [...result].sort((a, b) => a.gameName.localeCompare(b.gameName))
    }
    // 'owners' is the default sort from the API

    return result
  }, [games, searchQuery, filters.selectedGenres, filters.minMetacritic, filters.gamesOnly, filters.platform, filters.controllerOnly, filters.sortBy])

  const isFiltering = searchQuery.trim().length > 0 || filters.selectedGenres.length > 0 || filters.minMetacritic !== null || filters.controllerOnly || filters.platform !== 'all'
  const displayedGames = isFiltering || showAll
    ? filteredGames
    : filteredGames.slice(0, DISPLAY_CAP)
  const hasMore = !isFiltering && !showAll && filteredGames.length > DISPLAY_CAP

  // Virtualization for large lists
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(2)
  const shouldVirtualize = displayedGames.length >= VIRTUALIZE_THRESHOLD

  const updateColumnCount = useCallback(() => {
    const w = scrollContainerRef.current?.offsetWidth ?? window.innerWidth
    if (w >= 1024) setColumnCount(4)
    else if (w >= 640) setColumnCount(3)
    else setColumnCount(2)
  }, [])

  useEffect(() => {
    if (!shouldVirtualize) return
    updateColumnCount()
    const observer = new ResizeObserver(updateColumnCount)
    if (scrollContainerRef.current) observer.observe(scrollContainerRef.current)
    return () => observer.disconnect()
  }, [shouldVirtualize, updateColumnCount])

  const rowCount = shouldVirtualize ? Math.ceil(displayedGames.length / columnCount) : 0

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => {
      // aspect-[460/215] → height = width / (460/215) ≈ width * 0.467 + gap
      const containerWidth = scrollContainerRef.current?.offsetWidth ?? 300
      const gap = 8
      const cardWidth = (containerWidth - gap * (columnCount - 1)) / columnCount
      return cardWidth * (215 / 460) + gap
    },
    overscan: 3,
    enabled: shouldVirtualize,
  })

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
        <div className="space-y-2">
          {/* Search + mode toggles */}
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
            <div className="flex gap-1.5 shrink-0">
              <Button
                variant={filters.multiplayerOnly ? 'default' : 'secondary'}
                size="sm"
                onClick={() => onToggleMultiplayer(!filters.multiplayerOnly)}
                className="gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                {t('group.multiplayerOnly')}
              </Button>
              <Button
                variant={filters.coopOnly ? 'default' : 'secondary'}
                size="sm"
                onClick={() => onToggleCoop(!filters.coopOnly)}
                className="gap-1.5"
              >
                <Handshake className="w-3.5 h-3.5" />
                {t('group.coopOnly')}
              </Button>
              <Button
                variant={filters.gamesOnly ? 'default' : 'secondary'}
                size="sm"
                onClick={() => onToggleGamesOnly(!filters.gamesOnly)}
                className="gap-1.5"
              >
                <Monitor className="w-3.5 h-3.5" />
                {t('group.gamesOnly')}
              </Button>
              <Button
                variant={filters.controllerOnly ? 'default' : 'secondary'}
                size="sm"
                onClick={() => onToggleControllerOnly(!filters.controllerOnly)}
                className="gap-1.5"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                {t('group.controllerSupport')}
              </Button>
            </div>
          </div>

          {/* Metacritic filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Star className="w-3 h-3" />
              {t('group.metacritic')}
            </span>
            {METACRITIC_THRESHOLDS.map((threshold) => (
              <Button
                key={threshold ?? 'all'}
                variant={filters.minMetacritic === threshold ? 'default' : 'outline'}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => onSetMinMetacritic(threshold)}
              >
                {threshold === null ? t('group.allScores') : `${threshold}+`}
              </Button>
            ))}
          </div>

          {/* Platform filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              {t('group.platform')}
            </span>
            {(['all', 'windows', 'mac', 'linux'] as const).map((p) => (
              <Button
                key={p}
                variant={filters.platform === p ? 'default' : 'outline'}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => onSetPlatform(p)}
              >
                {t(`group.platform_${p}`)}
              </Button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {t('group.sortBy')}
            </span>
            {(['owners', 'popularity', 'name'] as const).map((s) => (
              <Button
                key={s}
                variant={filters.sortBy === s ? 'default' : 'outline'}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => onSetSortBy(s)}
              >
                {t(`group.sort_${s}`)}
              </Button>
            ))}
          </div>

          {/* Genre filter */}
          {availableGenres.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setGenreExpanded(!genreExpanded)}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${genreExpanded ? 'rotate-180' : ''}`} />
                {t('group.genres')}
                {filters.selectedGenres.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-xs">
                    {filters.selectedGenres.length}
                  </Badge>
                )}
              </button>
              {genreExpanded && (
                <div className="flex flex-wrap gap-2">
                  {availableGenres.map((genre) => {
                    const isSelected = filters.selectedGenres.includes(genre.id)
                    return (
                      <button
                        key={genre.id}
                        type="button"
                        onClick={() => onToggleGenre(genre.id)}
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {genre.description}
                      </button>
                    )
                  })}
                  {filters.selectedGenres.length > 0 && (
                    <button
                      type="button"
                      onClick={() => filters.selectedGenres.forEach(id => onToggleGenre(id))}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3 mr-0.5" />
                      {t('group.clearGenres')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
            onClick={() => {
              setSearchQuery('')
              onResetFilters()
            }}
            className="text-sm text-primary hover:underline mt-1"
          >
            {t('group.clearFilters')}
          </button>
        </div>
      ) : (
        <>
          {shouldVirtualize ? (
            <div
              ref={scrollContainerRef}
              className="overflow-y-auto"
              style={{ maxHeight: '70vh' }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const startIndex = virtualRow.index * columnCount
                  const rowGames = displayedGames.slice(startIndex, startIndex + columnCount)
                  return (
                    <div
                      key={virtualRow.key}
                      className="grid gap-2 absolute w-full"
                      style={{
                        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {rowGames.map((game) => (
                        <GameCard key={game.steamAppId} game={game} t={t} />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {displayedGames.map((game) => (
                <GameCard key={game.steamAppId} game={game} t={t} />
              ))}
            </div>
          )}
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

function GameCard({ game, t }: { game: Game; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <div className="relative group" style={{ transition: 'opacity 150ms ease' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
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
          </div>
        </TooltipTrigger>
        {game.shortDescription && (
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {game.shortDescription}
          </TooltipContent>
        )}
      </Tooltip>
      {game.metacriticScore !== null && (
        <span className={`absolute top-1 left-1 text-xs font-bold px-1.5 py-0.5 rounded ${
          game.metacriticScore >= 75 ? 'bg-emerald-600 text-white' :
          game.metacriticScore >= 50 ? 'bg-amber-500 text-white' :
          'bg-red-600 text-white'
        }`}>
          {game.metacriticScore}
        </span>
      )}
      {game.ownerCount < game.totalMembers && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="absolute top-1 right-1 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-help">
              <Users className="w-2.5 h-2.5" />
              {game.ownerCount}/{game.totalMembers}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t('group.ownerCountHint', { owned: game.ownerCount, total: game.totalMembers })}
          </TooltipContent>
        </Tooltip>
      )}
      <div className="absolute bottom-7 right-1 flex gap-0.5">
        {game.isFree && (
          <span className="text-xs font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded">
            {t('group.free')}
          </span>
        )}
        {game.controllerSupport && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs bg-black/70 text-white px-1 py-0.5 rounded cursor-help">
                <Gamepad2 className="w-2.5 h-2.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('group.controllerSupportLevel', { level: game.controllerSupport })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
