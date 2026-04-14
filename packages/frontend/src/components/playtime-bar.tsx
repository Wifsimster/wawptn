import { cn } from '@/lib/utils'

interface PlaytimeBarProps {
  /** Minutes on side A (viewer's left-hand user). */
  playtimeA: number | null
  /** Minutes on side B (viewer's right-hand user). */
  playtimeB: number | null
  className?: string
}

/**
 * Horizontal split bar showing A's share vs B's share of the total
 * combined playtime for a single game. Used on the compare view to
 * make "who played this more" obvious at a glance without forcing
 * the user to read numbers.
 */
export function PlaytimeBar({ playtimeA, playtimeB, className }: PlaytimeBarProps) {
  const a = playtimeA ?? 0
  const b = playtimeB ?? 0
  const total = a + b
  // If neither side has playtime data, render an inert placeholder
  // rather than a division-by-zero artifact.
  const aRatio = total > 0 ? (a / total) * 100 : 50
  const bRatio = total > 0 ? (b / total) * 100 : 50

  return (
    <div
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30', className)}
      role="img"
      aria-label={`A: ${Math.round(aRatio)}%, B: ${Math.round(bRatio)}%`}
    >
      <div
        className="h-full bg-primary/70 transition-[width] duration-500"
        style={{ width: `${aRatio}%` }}
      />
      <div
        className="h-full bg-ember/70 transition-[width] duration-500"
        style={{ width: `${bRatio}%` }}
      />
    </div>
  )
}
