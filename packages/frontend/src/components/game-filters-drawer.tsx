import { Star, ChevronDown, Gamepad2, Monitor, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from '@/components/ui/responsive-dialog'
import type { GameFilters } from '@/components/game-grid'

const METACRITIC_THRESHOLDS = [null, 60, 70, 75, 80, 85, 90] as const

interface Genre {
  id: string
  description: string
}

interface GameFiltersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: GameFilters
  availableGenres: Genre[]
  genreExpanded: boolean
  onToggleGenreExpanded: () => void
  advancedFilterCount: number
  onToggleGenre: (genre: string) => void
  onSetMinMetacritic: (value: number | null) => void
  onToggleGamesOnly: (value: boolean) => void
  onToggleControllerOnly: (value: boolean) => void
  onSetSortBy: (value: 'owners' | 'popularity' | 'name') => void
  onResetFilters: () => void
}

/**
 * Advanced filters drawer — holds everything that used to shout from the main
 * panel: metacritic, sort, genres, and the less-used "gamesOnly / controller"
 * toggles. Extracted from GameGrid to keep that component focused on the list
 * + empty states; the drawer's markup is large and self-contained.
 */
export function GameFiltersDrawer({
  open,
  onOpenChange,
  filters,
  availableGenres,
  genreExpanded,
  onToggleGenreExpanded,
  advancedFilterCount,
  onToggleGenre,
  onSetMinMetacritic,
  onToggleGamesOnly,
  onToggleControllerOnly,
  onSetSortBy,
  onResetFilters,
}: GameFiltersDrawerProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('group.moreFilters')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t('group.moreFiltersDescription')}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {/* No nested scroll container — `ResponsiveDialogContent`
            already caps at 96dvh and scrolls. Adding our own
            overflow-y here created a swipe-trap on iOS where the
            outer drawer-handle pull-down gesture got captured by
            the inner scroller (mobile review §C4 follow-up). */}
        <div className="px-4 pb-4 space-y-5">
          {/* Metacritic */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
              <Star className="size-3" />
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
              <TrendingUp className="size-3" />
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
                <Monitor className="size-3.5" />
                {t('group.gamesOnly')}
              </Button>
              <Button
                variant={filters.controllerOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => onToggleControllerOnly(!filters.controllerOnly)}
                className="gap-1.5"
                aria-pressed={filters.controllerOnly}
              >
                <Gamepad2 className="size-3.5" />
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
                onClick={onToggleGenreExpanded}
                aria-expanded={genreExpanded}
              >
                <ChevronDown className={`size-3 transition-transform ${genreExpanded ? 'rotate-180' : ''}`} />
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
              onOpenChange(false)
            }}
            disabled={advancedFilterCount === 0 && !filters.multiplayerOnly && !filters.coopOnly}
          >
            {t('group.clearFilters')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            {t('group.done')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
