import { ArrowLeft, Check, Loader2, Search, Send, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { GameDetailDialog } from './game-detail-dialog'
import type { Game } from './types'

interface GameCardProps {
  game: Game
  isSelected: boolean
  onToggle: (steamAppId: number) => void
  onShowDetails: (game: Game) => void
}

function GameCard({ game, isSelected, onToggle, onShowDetails }: GameCardProps) {
  const { t } = useTranslation()
  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-primary ring-2 ring-primary/30 shadow-lg'
          : 'border-border hover:border-muted-foreground/40'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(game.steamAppId)}
        className="w-full text-left active:scale-95 active:bg-accent/10 transition-transform"
        aria-label={isSelected ? t('vote.deselectGame', { name: game.gameName }) : t('vote.selectGame', { name: game.gameName })}
        aria-pressed={isSelected}
      >
        <img
          src={game.headerImageUrl}
          alt={game.gameName}
          width={460}
          height={215}
          loading="lazy"
          decoding="async"
          className={`w-full aspect-[460/215] object-cover transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-90'
          }`}
        />
      </button>
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 size-6 bg-primary rounded-full flex items-center justify-center pointer-events-none">
          <Check className="size-4 text-primary-foreground" />
        </div>
      )}
      {game.metacriticScore != null && (
        <span className={`absolute top-1.5 left-1.5 text-xs font-bold px-1.5 py-0.5 rounded pointer-events-none ${
          game.metacriticScore >= 75 ? 'bg-score-good text-white' :
          game.metacriticScore >= 50 ? 'bg-score-mixed text-white' :
          'bg-score-bad text-white'
        }`}>
          {game.metacriticScore}
        </span>
      )}
      <div className="flex items-center justify-between p-2">
        <p className="text-xs font-medium truncate flex-1 min-w-0">{game.gameName}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onShowDetails(game)
              }}
              className="ml-1 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-accent/10 active:scale-95 transition-all"
              aria-label={t('vote.gameDetails')}
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t('vote.gameDetails')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

interface GameSelectionProps {
  games: Game[]
  filteredGames: Game[]
  selectedGames: Set<number>
  search: string
  detailGame: Game | null
  submitting: boolean
  onSearchChange: (value: string) => void
  onToggleGame: (steamAppId: number) => void
  onShowDetails: (game: Game | null) => void
  onSubmit: () => void
  onBack: () => void
}

export function GameSelection({
  games,
  filteredGames,
  selectedGames,
  search,
  detailGame,
  submitting,
  onSearchChange,
  onToggleGame,
  onShowDetails,
  onSubmit,
  onBack,
}: GameSelectionProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('group.back')}>
          <ArrowLeft className="size-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="flex-1 flex flex-col p-4 max-w-2xl mx-auto w-full">
        <div className="text-center mb-4">
          <h1 className="text-xl font-heading font-bold">{t('vote.selectGamesTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('vote.selectGamesHint', { count: games.length })}
          </p>
        </div>

        {/* Search bar */}
        <search className="relative mb-4 block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('group.searchGames')}
            aria-label={t('group.searchGames')}
            className="w-full min-h-[44px] rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-primary/30"
          />
        </search>

        {/* Scrollable grid area: holds the sticky selection badge so users
            don't lose track of their pick count while scrolling on mobile. */}
        <div className="flex-1 overflow-y-auto pb-24 touch-scroll overscroll-contain">
          {/* Sticky selection counter — appears at the top of the scroll
              container as soon as the user picks at least one game. The
              floating bottom bar still shows the same count and the submit
              CTA, but on mobile the bottom bar is easily covered by the
              scrolling thumb, so this pill keeps the context visible at the
              top of the viewport. */}
          {selectedGames.size > 0 && (
            // Polite live region instead of aria-hidden — screen reader users
            // also need the count, especially on long ballots where the
            // bottom bar duplicate scrolls out of view.
            <output
              aria-live="polite"
              aria-atomic="true"
              className="sticky top-0 z-10 -mx-1 mb-3 flex justify-center pointer-events-none"
            >
              <span className="rounded-full border border-primary/40 bg-background/85 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                {t('vote.gamesSelected', { count: selectedGames.size })}
              </span>
            </output>
          )}
          {/* The interactive children below are <button>s with their own
              accessible names; an outer role="list"/role="listitem" stack
              causes screen readers to announce each card twice ("list, 1
              of N, button"). Native <ul>/<li> would carry the same
              implicit semantics, but in this grid layout we skip the
              wrapper roles entirely. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredGames.map(game => (
            <GameCard
              key={game.steamAppId}
              game={game}
              isSelected={selectedGames.has(game.steamAppId)}
              onToggle={onToggleGame}
              onShowDetails={onShowDetails}
            />
          ))}
          </div>
        </div>

        {/* Game detail dialog */}
        <GameDetailDialog
          game={detailGame}
          isSelected={detailGame ? selectedGames.has(detailGame.steamAppId) : false}
          onOpenChange={(open) => { if (!open) onShowDetails(null) }}
          onToggle={onToggleGame}
          t={t}
        />

        {/* Floating submit button */}
        <div className="fixed bottom-0 left-0 right-0 p-2.5 sm:p-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-sm shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <output aria-live="polite" className="text-sm text-muted-foreground">
              {t('vote.gamesSelected', { count: selectedGames.size })}
            </output>
            <Button onClick={onSubmit} disabled={submitting || selectedGames.size === 0} aria-label={t('vote.submitSelection')} className="relative">
              {submitting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Send className="size-4 mr-2" />
              )}
              {t('vote.submitSelection')}
              {selectedGames.size > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {selectedGames.size}
                </span>
              )}
            </Button>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  )
}
