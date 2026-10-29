import { cn } from '@/lib/utils'

interface StatDiffChipProps {
  value: number
  unit?: string
  neutralLabel?: string
  className?: string
}

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

const valueFormatter = new Intl.NumberFormat('fr-FR')

function formatValue(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000) return `${(value / 1000).toFixed(1)}k`
  return valueFormatter.format(value)
}
