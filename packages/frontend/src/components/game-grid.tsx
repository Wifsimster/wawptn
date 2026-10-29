import { useMemo, useReducer } from 'react'
import { Star, Gamepad2, SearchX, RefreshCw, ShieldAlert, EyeOff, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CommonGame } from '@wawptn/types'
import { EmptyState } from '@/components/empty-state'
import { GameFilterBar } from '@/components/game-filter-bar'
import { GameFiltersDrawer } from '@/components/game-filters-drawer'
import { GameList } from '@/components/game-list'

type Game = CommonGame

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
  onApplyPreset: (patch: Partial<GameFilters>) => void
  onSyncLibraries?: () => void
  syncing?: boolean
}

const DISPLAY_CAP = 50

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface UiState {
  searchQuery: string
  showAll: boolean
  genreExpanded: boolean
  filtersDrawerOpen: boolean
}

const initialUiState: UiState = {
  searchQuery: '',
  showAll: false,
  genreExpanded: false,
  filtersDrawerOpen: false,
}

type UiAction =
  | { type: 'setSearchQuery'; value: string }
  | { type: 'showAll' }
  | { type: 'toggleGenreExpanded' }
  | { type: 'setFiltersDrawerOpen'; value: boolean }

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'setSearchQuery':
      return { ...state, searchQuery: action.value }
    case 'showAll':
      return { ...state, showAll: true }
    case 'toggleGenreExpanded':
      return { ...state, genreExpanded: !state.genreExpanded }
    case 'setFiltersDrawerOpen':
      return { ...state, filtersDrawerOpen: action.value }
  }
}

function NoCommonGamesHint({ t }: { t: (key: string) => string }) {
  return (
    <ul className="space-y-2 text-xs text-muted-foreground">
      <li className="flex items-start gap-2">
        <ShieldAlert className="size-3.5 text-warning mt-0.5 shrink-0" />
        <span>{t('group.noCommonGamesHint1')}</span>
      </li>
      <li className="flex items-start gap-2">
        <EyeOff className="size-3.5 text-warning mt-0.5 shrink-0" />
        <span>{t('group.noCommonGamesHint2')}</span>
      </li>
      <li className="flex items-start gap-2">
        <Users className="size-3.5 text-warning mt-0.5 shrink-0" />
        <span>{t('group.noCommonGamesHint3')}</span>
      </li>
    </ul>
  )
}

export function GameGrid({ games, loading, filters, onToggleMultiplayer, onToggleCoop, onToggleGenre, onSetMinMetacritic, onToggleGamesOnly, onToggleControllerOnly, onSetSortBy, onResetFilters, onApplyPreset, onSyncLibraries, syncing }: GameGridProps) {
  const { t } = useTranslation()
  const [ui, dispatch] = useReducer(uiReducer, initialUiState)
  const { searchQuery, showAll, genreExpanded, filtersDrawerOpen } = ui

  const advancedFilterCount =
    (filters.selectedGenres.length > 0 ? 1 : 0) +
    (filters.minMetacritic !== null ? 1 : 0) +
    (filters.controllerOnly ? 1 : 0) +
    (!filters.gamesOnly ? 1 : 0) +
    (filters.sortBy !== 'popularity' ? 1 : 0)

  const noCommonGamesHint = useMemo(() => <NoCommonGamesHint t={t} />, [t])

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

  const gamesBeforeMetacritic = useMemo(() => {
    let result = games

    if (searchQuery.trim() !== '') {
      const q = normalize(searchQuery)
      result = result.filter((g) => normalize(g.gameName).includes(q))
    }

    if (filters.gamesOnly) {
      result = result.filter((g) => !g.type || g.type === 'game')
    }

    if (filters.controllerOnly) {
      result = result.filter((g) => g.controllerSupport === 'full' || g.controllerSupport === 'partial')
    }

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

    if (filters.minMetacritic !== null) {
      result = result.filter((g) => {
        if (g.metacriticScore === null) return false
        return g.metacriticScore >= filters.minMetacritic!
      })
    }

    if (filters.sortBy === 'popularity') {
      result = result.toSorted((a, b) => (b.recommendationsTotal ?? 0) - (a.recommendationsTotal ?? 0))
    } else if (filters.sortBy === 'name') {
      result = result.toSorted((a, b) => a.gameName.localeCompare(b.gameName))
    }

    return result
  }, [gamesBeforeMetacritic, filters.minMetacritic, filters.sortBy])

  const hiddenByMetacritic = filters.minMetacritic === null
    ? 0
    : gamesBeforeMetacritic.length - filteredGames.length

  const isFiltering = searchQuery.trim().length > 0 || filters.selectedGenres.length > 0 || filters.minMetacritic !== null || filters.controllerOnly
  const displayedGames = isFiltering || showAll
    ? filteredGames
    : filteredGames.slice(0, DISPLAY_CAP)
  const hasMore = !isFiltering && !showAll && filteredGames.length > DISPLAY_CAP

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
        <GameFilterBar
          filters={filters}
          searchQuery={searchQuery}
          onSearchChange={(value) => dispatch({ type: 'setSearchQuery', value })}
          advancedFilterCount={advancedFilterCount}
          filtersDrawerOpen={filtersDrawerOpen}
          onOpenFiltersDrawer={() => dispatch({ type: 'setFiltersDrawerOpen', value: true })}
          onToggleMultiplayer={onToggleMultiplayer}
          onToggleCoop={onToggleCoop}
          onToggleGenre={onToggleGenre}
          onSetMinMetacritic={onSetMinMetacritic}
          onToggleGamesOnly={onToggleGamesOnly}
          onToggleControllerOnly={onToggleControllerOnly}
          onSetSortBy={onSetSortBy}
          onApplyPreset={onApplyPreset}
        />
      )}

      <GameFiltersDrawer
        open={filtersDrawerOpen}
        onOpenChange={(value) => dispatch({ type: 'setFiltersDrawerOpen', value })}
        filters={filters}
        availableGenres={availableGenres}
        genreExpanded={genreExpanded}
        onToggleGenreExpanded={() => dispatch({ type: 'toggleGenreExpanded' })}
        advancedFilterCount={advancedFilterCount}
        onToggleGenre={onToggleGenre}
        onSetMinMetacritic={onSetMinMetacritic}
        onToggleGamesOnly={onToggleGamesOnly}
        onToggleControllerOnly={onToggleControllerOnly}
        onSetSortBy={onSetSortBy}
        onResetFilters={onResetFilters}
      />

      {!loading && hiddenByMetacritic > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Star className="size-3.5 shrink-0" />
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
          hint={noCommonGamesHint}
        />
      ) : filteredGames.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t('group.noSearchResultsTitle')}
          description={t('group.noSearchResultsDescription')}
          action={{
            label: t('group.clearFilters'),
            onClick: () => {
              dispatch({ type: 'setSearchQuery', value: '' })
              onResetFilters()
            },
          }}
        />
      ) : (
        <>
          <GameList games={displayedGames} t={t} />
          {hasMore && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => dispatch({ type: 'showAll' })}
            >
              {t('group.showAll', { count: filteredGames.length })}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
