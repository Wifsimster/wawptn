import { Search, X, Users, Handshake, Star, Gamepad2, Monitor, TrendingUp, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { GameFilters } from '@/components/game-grid'
import { FILTER_PRESETS, matchActivePreset } from '@/components/game-filter-presets'

interface GameFilterBarProps {
  filters: GameFilters
  searchQuery: string
  onSearchChange: (value: string) => void
  advancedFilterCount: number
  filtersDrawerOpen: boolean
  onOpenFiltersDrawer: () => void
  onToggleMultiplayer: (value: boolean) => void
  onToggleCoop: (value: boolean) => void
  onToggleGenre: (genre: string) => void
  onSetMinMetacritic: (value: number | null) => void
  onToggleGamesOnly: (value: boolean) => void
  onToggleControllerOnly: (value: boolean) => void
  onSetSortBy: (value: 'owners' | 'popularity' | 'name') => void
  onApplyPreset: (patch: Partial<GameFilters>) => void
}

export function GameFilterBar({
  filters,
  searchQuery,
  onSearchChange,
  advancedFilterCount,
  filtersDrawerOpen,
  onOpenFiltersDrawer,
  onToggleMultiplayer,
  onToggleCoop,
  onToggleGenre,
  onSetMinMetacritic,
  onToggleGamesOnly,
  onToggleControllerOnly,
  onSetSortBy,
  onApplyPreset,
}: GameFilterBarProps) {
  const { t } = useTranslation()
  const activePresetId = matchActivePreset(filters)

  return (
    <div className="space-y-2 min-w-0">
      {/* Search + "Plus de filtres" entry on the same row — keeps the
          primary surface compact and pushes advanced knobs (metacritic,
          sort, genres, gamesOnly, controllerOnly) into a drawer. */}
      <div className="flex items-center gap-2">
        <search className="relative flex-1 min-w-0 block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('group.searchGames')}
            aria-label={t('group.searchGames')}
            className="pl-9 pr-9 w-full"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label={t('group.clearSearch')}
            >
              <X className="size-4" />
            </button>
          )}
        </search>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenFiltersDrawer}
          className="gap-1.5 shrink-0 h-10"
          aria-haspopup="dialog"
          aria-expanded={filtersDrawerOpen}
        >
          <SlidersHorizontal className="size-3.5" />
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
          <Users className="size-3.5" />
          {t('group.multiplayerOnly')}
        </Button>
        <Button
          variant={filters.coopOnly ? 'default' : 'secondary'}
          size="sm"
          onClick={() => onToggleCoop(!filters.coopOnly)}
          className="gap-1.5"
          aria-pressed={filters.coopOnly}
        >
          <Handshake className="size-3.5" />
          {t('group.coopOnly')}
        </Button>
      </div>

      {/* Preset chips row — opinionated shortcuts that patch several
          filter fields at once. Scrolls horizontally on tight screens
          so all presets stay reachable without wrapping. */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 shrink-0 pr-1">
          <Sparkles className="size-3" />
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
              <Icon className="size-3" />
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
              <Star className="size-3" />
              {filters.minMetacritic}+
              <X className="size-3" />
            </button>
          )}
          {filters.controllerOnly && (
            <button
              type="button"
              onClick={() => onToggleControllerOnly(false)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={t('group.clearFilter', { name: t('group.controllerSupport') })}
            >
              <Gamepad2 className="size-3" />
              {t('group.controllerSupport')}
              <X className="size-3" />
            </button>
          )}
          {!filters.gamesOnly && (
            <button
              type="button"
              onClick={() => onToggleGamesOnly(true)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={t('group.clearFilter', { name: t('group.gamesOnly') })}
            >
              <Monitor className="size-3" />
              {t('group.includeDLC')}
              <X className="size-3" />
            </button>
          )}
          {filters.sortBy !== 'popularity' && (
            <button
              type="button"
              onClick={() => onSetSortBy('popularity')}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label={t('group.clearFilter', { name: t('group.sortBy') })}
            >
              <TrendingUp className="size-3" />
              {t(`group.sort_${filters.sortBy}`)}
              <X className="size-3" />
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
              <X className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
