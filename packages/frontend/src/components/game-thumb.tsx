import { useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveSteamHeaderImage } from '@/lib/steam-cdn'

interface GameThumbProps {
  appId: number
  name: string
  /** Pre-resolved image URL (e.g. from the API); falls back to the Steam CDN. */
  src?: string | null
  className?: string
}

/** Steam header thumbnail with a graceful fallback. Steam's CDN 404s for
 *  delisted apps, DLC and non-game entries; on error we render a tiled
 *  placeholder with the game's initial so the row keeps its height instead
 *  of collapsing and overlapping neighbouring text. */
export function GameThumb({ appId, name, src, className }: GameThumbProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded bg-muted text-muted-foreground text-xs font-bold uppercase shrink-0',
          className,
        )}
        aria-hidden="true"
      >
        {name.charAt(0)}
      </div>
    )
  }

  return (
    <img
      src={resolveSteamHeaderImage(appId, src)}
      alt=""
      width={460}
      height={215}
      className={cn('rounded object-cover bg-muted shrink-0', className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
