import { useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveSteamHeaderImage } from '@/lib/steam-cdn'

interface GameThumbProps {
  appId: number
  name: string
  src?: string | null
  className?: string
}

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
