import { ExternalLink, Check, Monitor, Apple, Gamepad2, Star } from 'lucide-react'
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
import { decodeHtmlEntities } from '@/lib/utils'
import type { Game } from './types'

interface GameDetailDialogProps {
  game: Game | null
  isSelected: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (steamAppId: number) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

export function GameDetailDialog({ game, isSelected, onOpenChange, onToggle, t }: GameDetailDialogProps) {
  if (!game) return null

  const steamStoreUrl = `https://store.steampowered.com/app/${game.steamAppId}`

  return (
    <ResponsiveDialog open={!!game} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{game.gameName}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('vote.gameDetailsFor', { name: game.gameName })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Header image — eager since it's in-viewport when the dialog opens. */}
        <img
          src={game.headerImageUrl}
          alt={game.gameName}
          width={460}
          height={215}
          loading="eager"
          decoding="async"
          className="w-full rounded-lg aspect-[460/215] object-cover"
        />

        {/* Metadata badges row */}
        <div className="flex flex-wrap gap-2">
          {/* Metacritic */}
          {game.metacriticScore != null && (
            <Badge
              variant="outline"
              className={`gap-1 ${
                game.metacriticScore >= 75 ? 'border-score-good text-score-good' :
                game.metacriticScore >= 50 ? 'border-score-mixed text-score-mixed' :
                'border-score-bad text-score-bad'
              }`}
            >
              <Star className="size-3" />
              Metacritic {game.metacriticScore}
            </Badge>
          )}

          {/* Free badge */}
          {game.isFree && (
            <Badge variant="secondary" className="bg-score-good/10 text-score-good border-score-good/20">
              {t('vote.free')}
            </Badge>
          )}

          {/* Controller support */}
          {game.controllerSupport && (
            <Badge variant="secondary" className="gap-1">
              <Gamepad2 className="size-3" />
              {t('vote.controllerSupport', { level: game.controllerSupport })}
            </Badge>
          )}

          {/* Release date */}
          {game.releaseDate && (
            <Badge variant="outline">
              {game.releaseDate}
            </Badge>
          )}
        </div>

        {/* Platforms */}
        {game.platforms && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t('vote.platforms')}:</span>
            <div className="flex gap-2">
              {game.platforms.windows && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Monitor className="size-3.5" />
                  Windows
                </span>
              )}
              {game.platforms.mac && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Apple className="size-3.5" />
                  Mac
                </span>
              )}
              {game.platforms.linux && (
                <span className="flex items-center gap-1 text-xs text-foreground">
                  <Monitor className="size-3.5" />
                  Linux
                </span>
              )}
            </div>
          </div>
        )}

        {/* Genres */}
        {game.genres && game.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {game.genres.map(genre => (
              <Badge key={genre.id} variant="secondary" className="text-xs">
                {genre.description}
              </Badge>
            ))}
          </div>
        )}

        {/* Short description */}
        {game.shortDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {decodeHtmlEntities(game.shortDescription)}
          </p>
        )}

        {/* Footer actions */}
        <ResponsiveDialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="gap-1.5"
          >
            <a href={steamStoreUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              {t('vote.viewOnSteam')}
            </a>
          </Button>

          <Button
            variant={isSelected ? 'secondary' : 'default'}
            size="sm"
            onClick={() => onToggle(game.steamAppId)}
            className="gap-1.5"
          >
            <Check className={`size-4 ${isSelected ? '' : 'opacity-0'}`} />
            {isSelected ? t('vote.deselect') : t('vote.select')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
