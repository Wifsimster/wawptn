import { cn } from '@/lib/utils'

interface PlaytimeBarProps {
  playtimeA: number | null
  playtimeB: number | null
  className?: string
}

export function PlaytimeBar({ playtimeA, playtimeB, className }: PlaytimeBarProps) {
  const a = playtimeA ?? 0
  const b = playtimeB ?? 0
  const total = a + b
  const aRatio = total > 0 ? (a / total) * 100 : 50
  const bRatio = total > 0 ? (b / total) * 100 : 50

  const label = `A: ${Math.round(aRatio)}%, B: ${Math.round(bRatio)}%`

  return (
    <div className={cn('relative flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30', className)}>
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
