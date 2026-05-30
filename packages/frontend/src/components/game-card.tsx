import { memo } from 'react'
import { Users, Star, Gamepad2 } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { CommonGame } from '@wawptn/types'
import { useWishlistStore } from '@/stores/wishlist.store'
import { decodeHtmlEntities } from '@/lib/utils'
import { resolveSteamHeaderImage } from '@/lib/steam-cdn'

type Game = CommonGame

function resolveHeaderImage(game: Game): string {
  return resolveSteamHeaderImage(game.steamAppId, game.headerImageUrl)
}

// React.memo so virtualizer slice changes (e.g. on viewport resize)
// don't force every visible card to re-render. `game` is stable per
// appId from the parent's useMemo'd filtered list; `t` is stable for
// the locale. The wishlist Zustand subscription inside the body uses
// a steamAppId selector so an unrelated star toggle doesn't kick a
// sibling card either. See mobile review §C2.
export const GameCard = memo(function GameCard({ game, t }: { game: Game; t: (key: string, options?: Record<string, unknown>) => string }) {
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
    <li className="relative group rounded-lg overflow-hidden ring-1 ring-white/[0.06] hover:ring-primary/20 transition-all duration-300 list-none" style={{ transition: 'opacity 150ms ease, box-shadow 0.3s, ring-color 0.3s' }}>
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
            <span className={`absolute top-1 left-1 text-xs font-bold px-1.5 py-0.5 rounded cursor-default text-background ${
              game.metacriticScore >= 75 ? 'bg-score-good' :
              game.metacriticScore >= 50 ? 'bg-score-mixed' :
              'bg-score-bad'
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
              <Users className="size-2.5" />
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
            className={`absolute ${game.ownerCount < game.totalMembers ? 'top-8' : 'top-1'} right-1 flex size-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all hover:bg-black/80 ${
              isWishlisted ? 'text-reward' : 'text-white/60 hover:text-white'
            }`}
          >
            <Star className={`size-3.5 ${isWishlisted ? 'fill-current' : ''}`} />
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
              <span
                className="text-xs bg-black/70 text-white px-1 py-0.5 rounded cursor-help"
                aria-label={t('group.controllerSupportLevel', { level: game.controllerSupport })}
              >
                <Gamepad2 className="size-2.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t('group.controllerSupportLevel', { level: game.controllerSupport })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  )
})
