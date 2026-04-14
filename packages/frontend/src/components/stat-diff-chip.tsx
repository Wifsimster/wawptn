import { cn } from '@/lib/utils'

interface StatDiffChipProps {
  /** Signed diff value (positive = A ahead, negative = B ahead). */
  value: number
  /** Unit suffix, e.g. "h", "min", "". */
  unit?: string
  /** Neutral label used when value === 0. */
  neutralLabel?: string
  className?: string
}

/**
 * Colored pill used to surface A-vs-B differences on the compare
 * screen. Positive values render with the "neon" accent, negative
 * with the "ember" accent, zero with a muted chrome.
 *
 * Pulled out on day one (Camille) so the same visual language shows
 * up on profile headers, compare rows, and — eventually — vote
 * result breakdowns.
 */
export function StatDiffChip({ value, unit = '', neutralLabel = '=', className }: StatDiffChipProps) {
  const isZero = value === 0
  const isPositive = value > 0
  const sign = isPositive ? '+' : ''
  const display = isZero ? neutralLabel : `${sign}${formatValue(value)}${unit}`

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-mono font-semibold tabular-nums',
        isZero && 'bg-muted/40 text-muted-foreground',
        isPositive && 'bg-success/15 text-success',
        !isZero && !isPositive && 'bg-ember/15 text-ember',
        className
      )}
      aria-label={isZero ? neutralLabel : `${sign}${value}${unit}`}
    >
      {display}
    </span>
  )
}

function formatValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000) return `${(value / 1000).toFixed(1)}k`
  return new Intl.NumberFormat('fr-FR').format(value)
}
