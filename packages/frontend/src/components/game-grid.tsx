import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Search, X, Users, Handshake, Star, ChevronDown, Gamepad2, Monitor, TrendingUp, SearchX, RefreshCw, ShieldAlert, EyeOff, SlidersHorizontal, Sparkles, Sofa, Trophy, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import type { CommonGame } from '@wawptn/types'
import { EmptyState } from '@/components/empty-state'
import { useWishlistStore } from '@/stores/wishlist.store'
import { decodeHtmlEntities } from '@/lib/utils'
import { resolveSteamHeaderImage } from '@/lib/steam-cdn'

// Reuse the shared wire type so we don't drift from the API shape. The
// grid previously redeclared a subset inline, which silently allowed the
// `headerImageUrl` nullability to diverge from the rest of the app.
type Game = CommonGame

function resolveHeaderImage(game: Game): string {
  return resolveSteamHeaderImage(game.steamAppId, game.headerImageUrl)
}

export interface GameFilters {
  multiplayerOnly: boolean
  coopOnly: boolean
  selectedGenres: string[]
  minMetacritic: number | null
  gamesOnly: boolean
  controllerOnly: boolean
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
  onSetSortBy: (value: 'owners' | 'popularity' | 'name') => void
  onResetFilters: () => void
  /** Apply a smart preset patch over the current filter state. */
  onApplyPreset: (patch: Partial<GameFilters>) => void
  /** Trigger a library re-sync from the "no common games" empty state. */
  onSyncLibraries?: () => void
  /** True while a sync is in-flight — disables the retry button and shows a spinner. */
  syncing?: boolean
}

const DISPLAY_CAP = 50
const VIRTUALIZE_THRESHOLD = 100

const METACRITIC_THRESHOLDS = [null, 60, 70, 75, 80, 85, 90] as const

/**
 * Smart filter presets. Each preset is a partial patch over the current
 * GameFilters state — applying one just overwrites the fields it cares
 * about and leaves the rest alone. This keeps presets composable with
 * the search input and lets users layer a text query on top of a mood.
 * Reason chips are intentionally opinionated so the page feels curated
 * rather than a spreadsheet of toggles.
 */
type FilterPreset = {
  id: string
  labelKey: string
  icon: typeof Sparkles
  patch: Partial<GameFilters>
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'coopNight',
    labelKey: 'filterPresets.coopNight',
    icon: Handshake,
    patch: { coopOnly: true, multiplayerOnly: false, gamesOnly: true, controllerOnly: false, minMetacritic: null },
  },
  {
    id: 'couchCoop',
    labelKey: 'filterPresets.couchCoop',
    icon: Sofa,
    patch: { coopOnly: true, multiplayerOnly: false, gamesOnly: true, controllerOnly: true, minMetacritic: null },
  },
  {
    id: 'partyMulti',
    labelKey: 'filterPresets.partyMulti',
    icon: Zap,
    patch: { multiplayerOnly: true, coopOnly: false, gamesOnly: true, controllerOnly: false, minMetacritic: 70 },
  },
  {
    id: 'topRated',
    labelKey: 'filterPresets.topRated',
    icon: Trophy,
    patch: { gamesOnly: true, minMetacritic: 80, sortBy: 'popularity' },
  },
]

/**
 * Return the id of the currently-matching preset, or null. We consider a
 * preset "active" when every field it patches matches the current state —
 * so switching away from a preset removes its highlight immediately.
 */
function matchActivePreset(filters: GameFilters): string | null {
  for (const preset of FILTER_PRESETS) {
    const match = (Object.keys(preset.patch) as (keyof GameFilters)[]).every(
      (k) => filters[k] === preset.patch[k],
    )
    if (match) return preset.id
  }
  return null
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function GameGrid({ games, loading, filters, onToggleMultiplayer, onToggleCoop, onToggleGenre, onSetMinMetacritic, onToggleGamesOnly, onToggleControllerOnly, onSetSortBy, onResetFilters, onApplyPreset, onSyncLibraries, syncing }: GameGridProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [genreExpanded, setGenreExpanded] = useState(false)
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)

  // Count how many "advanced" filter knobs are active. Drives the small
  // badge on the "Plus de filtres" button so users can see at a glance
  // whether the drawer is hiding state from them.
  const advancedFilterCount =
    (filters.selectedGenres.length > 0 ? 1 : 0) +
    (filters.minMetacritic !== null ? 1 : 0) +
    (filters.controllerOnly ? 1 : 0) +
    (!filters.gamesOnly ? 1 : 0) +
    (filters.sortBy !== 'popularity' ? 1 : 0)

  const activePresetId = matchActivePreset(filters)

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

  // Apply every filter EXCEPT the Metacritic threshold so we can derive both
  // the final filtered list and the count of games specifically culled by
  // the Metacritic filter (used to surface the "X games hidden" banner).
  const gamesBeforeMetacritic = useMemo(() => {
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

    return result
  }, [games, searchQuery, filters.selectedGenres, filters.gamesOnly, filters.controllerOnly])

  const filteredGames = useMemo(() => {
    let result = gamesBeforeMetacritic

    // Metacritic filter (client-side) — this is the only filter that runs
    // after gamesBeforeMetacritic so the banner can count the culled games.
    if (filters.minMetacritic !== null) {
      result = result.filter((g) => {
        if (g.metacriticScore === null) return false
        return g.metacriticScore >= filters.minMetacritic!
      })
    }

    // Sorting (length-preserving — safe to derive hidden count from this)
    if (filters.sortBy === 'popularity') {
      result = [...result].sort((a, b) => (b.recommendationsTotal ?? 0) - (a.recommendationsTotal ?? 0))
    } else if (filters.sortBy === 'name') {
      result = [...result].sort((a, b) => a.gameName.localeCompare(b.gameName))
    }
    // 'owners' is the default sort from the API

    return result
  }, [gamesBeforeMetacritic, filters.minMetacritic, filters.sortBy])

  // Number of games that pass every other filter but are culled by the
  // Metacritic threshold. Drives the "X games hidden" banner; 0 when no
  // Metacritic filter is set or when nothing is being culled.
  const hiddenByMetacritic = filters.minMetacritic === null
    ? 0
    : gamesBeforeMetacritic.length - filteredGames.length

  const isFiltering = searchQuery.trim().length > 0 || filters.selectedGenres.length > 0 || filters.minMetacritic !== null || filters.controllerOnly
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
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-between min-w-0">
        <h2 className="font-semibold truncate">
          {isFiltering
            ? t('group.commonGamesFiltered', { filtered: filteredGames.length, total: games.length })
            : t('group.commonGames', { count: games.length })}
        </h2>
      </div>

      {!loading && games.length > 0 && (
        <div className="space-y-2 min-w-0">
          {/* Search + "Plus de filtres" entry on the same row — keeps the
              primary surface compact and pushes advanced knobs (metacritic,
              sort, genres, gamesOnly, controllerOnly) into a drawer. */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0" role="search">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('group.searchGames')}
                aria-label={t('group.searchGames')}
                className="pl-9 pr-9 w-full"
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
              variant="outline"
              size="sm"
              onClick={() => setFiltersDrawerOpen(true)}
              className="gap-1.5 shrink-0 h-10"
              aria-haspopup="dialog"
              aria-expanded={filtersDrawerOpen}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('group.moreFilters')}</span>
              {advancedFilterCount > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                  {advancedFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Smart mode chips — only the 2 highest-signal toggles remain on
              the main surface. Users get instant feedback without opening
              the drawer. `aria-pressed` makes the toggle state available
              to screen readers (variant change alone wasn't enough). */}
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={filters.multiplayerOnly ? 'default' : 'secondary'}
              size="sm"
              onClick={() => onToggleMultiplayer(!filters.multiplayerOnly)}
              className="gap-1.5"
              aria-pressed={filters.multiplayerOnly}
            >
              <Users className="w-3.5 h-3.5" />
              {t('group.multiplayerOnly')}
            </Button>
            <Button
              variant={filters.coopOnly ? 'default' : 'secondary'}
              size="sm"
              onClick={() => onToggleCoop(!filters.coopOnly)}
              className="gap-1.5"
              aria-pressed={filters.coopOnly}
            >
              <Handshake className="w-3.5 h-3.5" />
              {t('group.coopOnly')}
            </Button>
          </div>

          {/* Preset chips row — opinionated shortcuts that patch several
              filter fields at once. Scrolls horizontally on tight screens
              so all presets stay reachable without wrapping. */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 shrink-0 pr-1">
              <Sparkles className="w-3 h-3" />
              {t('filterPresets.label')}
            </span>
            {FILTER_PRESETS.map((preset) => {
              const Icon = preset.icon
              const isActive = activePresetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset.patch)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/60 text-secondary-foreground hover:bg-secondary'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {t(preset.labelKey)}
                </button>
              )
            })}
          </div>

          {/* Active advanced-filter summary row — dismissible chips so
              state hidden in the drawer is never invisible. */}
          {advancedFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {filters.minMetacritic !== null && (
                <button
                  type="button"
                  onClick={() => onSetMinMetacritic(null)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={t('group.clearFilter', { name: `Metacritic ${filters.minMetacritic}+` })}
                >
                  <Star className="w-3 h-3" />
                  {filters.minMetacritic}+
                  <X className="w-3 h-3" />
                </button>
              )}
              {filters.controllerOnly && (
                <button
                  type="button"
                  onClick={() => onToggleControllerOnly(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={t('group.clearFilter', { name: t('group.controllerSupport') })}
                >
                  <Gamepad2 className="w-3 h-3" />
                  {t('group.controllerSupport')}
                  <X className="w-3 h-3" />
                </button>
              )}
              {!filters.gamesOnly && (
                <button
                  type="button"
                  onClick={() => onToggleGamesOnly(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={t('group.clearFilter', { name: t('group.gamesOnly') })}
                >
                  <Monitor className="w-3 h-3" />
                  {t('group.includeDLC')}
                  <X className="w-3 h-3" />
                </button>
              )}
              {filters.sortBy !== 'popularity' && (
                <button
                  type="button"
                  onClick={() => onSetSortBy('popularity')}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={t('group.clearFilter', { name: t('group.sortBy') })}
                >
                  <TrendingUp className="w-3 h-3" />
                  {t(`group.sort_${filters.sortBy}`)}
                  <X className="w-3 h-3" />
                </button>
              )}
              {filters.selectedGenres.length > 0 && (
                <button
                  type="button"
                  onClick={() => filters.selectedGenres.forEach((id) => onToggleGenre(id))}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label={t('group.clearGenres')}
                >
                  {t('group.genres')} · {filters.selectedGenres.length}
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced filters drawer — holds everything that used to shout
          from the main panel: metacritic, sort, genres, and the less-used
          "gamesOnly / controller" toggles. Keeps the main surface calm. */}
      <ResponsiveDialog open={filtersDrawerOpen} onOpenChange={setFiltersDrawerOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('group.moreFilters')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('group.moreFiltersDescription')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="px-4 pb-4 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Metacritic */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                <Star className="w-3 h-3" />
                {t('group.metacritic')}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {METACRITIC_THRESHOLDS.map((threshold) => (
                  <Button
                    key={threshold ?? 'all'}
                    variant={filters.minMetacritic === threshold ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => onSetMinMetacritic(threshold)}
                    aria-pressed={filters.minMetacritic === threshold}
                  >
                    {threshold === null ? t('group.allScores') : `${threshold}+`}
                  </Button>
                ))}
              </div>
            </section>

            {/* Sort */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                <TrendingUp className="w-3 h-3" />
                {t('group.sortBy')}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['owners', 'popularity', 'name'] as const).map((s) => (
                  <Button
                    key={s}
                    variant={filters.sortBy === s ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => onSetSortBy(s)}
                    aria-pressed={filters.sortBy === s}
                  >
                    {t(`group.sort_${s}`)}
                  </Button>
                ))}
              </div>
            </section>

            {/* Secondary toggles */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('group.secondaryFilters')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={filters.gamesOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onToggleGamesOnly(!filters.gamesOnly)}
                  className="gap-1.5"
                  aria-pressed={filters.gamesOnly}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  {t('group.gamesOnly')}
                </Button>
                <Button
                  variant={filters.controllerOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onToggleControllerOnly(!filters.controllerOnly)}
                  className="gap-1.5"
                  aria-pressed={filters.controllerOnly}
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  {t('group.controllerSupport')}
                </Button>
              </div>
            </section>

            {/* Genres */}
            {availableGenres.length > 0 && (
              <section>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-2"
                  onClick={() => setGenreExpanded(!genreExpanded)}
                  aria-expanded={genreExpanded}
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
                          aria-pressed={isSelected}
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
                  </div>
                )}
              </section>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                onResetFilters()
                setFiltersDrawerOpen(false)
              }}
              disabled={advancedFilterCount === 0 && !filters.multiplayerOnly && !filters.coopOnly}
            >
              {t('group.clearFilters')}
            </Button>
            <Button onClick={() => setFiltersDrawerOpen(false)}>
              {t('group.done')}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Metacritic-hidden banner: explains *why* games disappeared and gives
          a one-tap path back to the full list. Only mounts when the filter
          is actually culling games so it never adds noise. */}
      {!loading && hiddenByMetacritic > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 shrink-0" />
            {t('group.metacriticHidden', { count: hiddenByMetacritic })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onSetMinMetacritic(null)}
          >
            {t('group.metacriticShowAll')}
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
        <EmptyState
          icon={Gamepad2}
          title={t('group.noCommonGamesTitle')}
          description={t('group.noCommonGamesDescription')}
          action={onSyncLibraries ? {
            label: syncing ? t('group.syncing') : t('group.retrySync'),
            onClick: onSyncLibraries,
            loading: syncing,
            icon: RefreshCw,
          } : undefined}
          hint={(
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{t('group.noCommonGamesHint1')}</span>
              </li>
              <li className="flex items-start gap-2">
                <EyeOff className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{t('group.noCommonGamesHint2')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <span>{t('group.noCommonGamesHint3')}</span>
              </li>
            </ul>
          )}
        />
      ) : filteredGames.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t('group.noSearchResultsTitle')}
          description={t('group.noSearchResultsDescription')}
          action={{
            label: t('group.clearFilters'),
            onClick: () => {
              setSearchQuery('')
              onResetFilters()
            },
          }}
        />
      ) : (
        <>
          {shouldVirtualize ? (
            <div
              ref={scrollContainerRef}
              className="overflow-y-auto"
              role="list"
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
            <div role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
  // Subscribe only to our own steamAppId's wishlist state so siblings
  // don't re-render when unrelated cards are starred. Zustand bails out
  // when the selected boolean hasn't actually changed, which keeps the
  // grid cheap even with hundreds of cards.
  const isWishlisted = useWishlistStore((s) => s.ids.has(game.steamAppId))
  const toggleWishlist = useWishlistStore((s) => s.toggle)

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleWishlist(game.steamAppId)
  }

  return (
    <div role="listitem" className="relative group rounded-lg overflow-hidden ring-1 ring-white/[0.06] hover:ring-primary/20 transition-all duration-300" style={{ transition: 'opacity 150ms ease, box-shadow 0.3s, ring-color 0.3s' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <img
              src={resolveHeaderImage(game)}
              alt={game.gameName}
              width={460}
              height={215}
              className="w-full aspect-[460/215] object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end p-2.5">
              <span className="text-xs font-semibold text-white leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{game.gameName}</span>
            </div>
          </div>
        </TooltipTrigger>
        {game.shortDescription && (
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            {decodeHtmlEntities(game.shortDescription)}
          </TooltipContent>
        )}
      </Tooltip>
      {game.metacriticScore !== null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`absolute top-1 left-1 text-xs font-bold px-1.5 py-0.5 rounded cursor-default ${
              game.metacriticScore >= 75 ? 'bg-score-good text-white' :
              game.metacriticScore >= 50 ? 'bg-score-mixed text-white' :
              'bg-score-bad text-white'
            }`}>
              {game.metacriticScore}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {t('group.metacriticTooltip', { score: game.metacriticScore })}
          </TooltipContent>
        </Tooltip>
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
      {/* Wishlist star — positioned below the owner-count badge when that
          badge is present, otherwise top-right. Click swallows the event
          so taps don't also trigger the underlying tooltip trigger. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleWishlistClick}
            aria-label={isWishlisted ? t('wishlist.removeLabel') : t('wishlist.addLabel')}
            aria-pressed={isWishlisted}
            className={`absolute ${game.ownerCount < game.totalMembers ? 'top-8' : 'top-1'} right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all hover:bg-black/80 ${
              isWishlisted ? 'text-reward' : 'text-white/60 hover:text-white'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-current' : ''}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {isWishlisted ? t('wishlist.inList') : t('wishlist.addTooltip')}
        </TooltipContent>
      </Tooltip>
      <div className="absolute bottom-7 right-1 flex gap-0.5">
        {game.isFree && (
          <span className="text-xs font-bold bg-score-good text-white px-1.5 py-0.5 rounded">
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
