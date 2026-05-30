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

  const label = `A: ${Math.round(aRatio)}%, B: ${Math.round(bRatio)}%`

  return (
    <div className={cn('relative flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30', className)}>
      {/* Inline SVG carries the accessible name for assistive tech; the
          visual split bar below is purely decorative (aria-hidden). */}
      <svg role="img" className="sr-only" aria-hidden={false}>
        <title>{label}</title>
      </svg>
      <div
        aria-hidden="true"
        className="h-full bg-primary/70 transition-[width] duration-500"
        style={{ width: `${aRatio}%` }}
      />
      <div
        aria-hidden="true"
        className="h-full bg-ember/70 transition-[width] duration-500"
        style={{ width: `${bRatio}%` }}
      />
    </div>
  )
}
