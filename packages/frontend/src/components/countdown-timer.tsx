import { useState, useEffect } from 'react'

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
}

function calcRemaining(target: Date): TimeRemaining {
  const total = Math.max(0, target.getTime() - Date.now())
  return {
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
    total,
  }
}

interface CountdownTimerProps {
  targetDate: Date
  onComplete?: () => void
  compact?: boolean
}

export function CountdownTimer({ targetDate, onComplete, compact = false }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => calcRemaining(targetDate))

  useEffect(() => {
    const interval = setInterval(() => {
      const r = calcRemaining(targetDate)
      setRemaining(r)
      if (r.total <= 0) {
        clearInterval(interval)
        onComplete?.()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate, onComplete])

  if (remaining.total <= 0) {
    return null
  }

  const pad = (n: number) => String(n).padStart(2, '0')

  if (compact) {
    const parts: string[] = []
    if (remaining.days > 0) parts.push(`${remaining.days}j`)
    if (remaining.hours > 0) parts.push(`${remaining.hours}h`)
    if (remaining.minutes > 0) parts.push(`${pad(remaining.minutes)}min`)
    if (parts.length === 0) parts.push(`${remaining.seconds}s`)
    return <span className="text-sm font-medium text-primary">{parts.join(' ')}</span>
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {remaining.days > 0 && (
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold tabular-nums bg-card rounded-lg px-3 py-1 border border-border">{remaining.days}</span>
          <span className="text-xs text-muted-foreground mt-1">jours</span>
        </div>
      )}
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums bg-card rounded-lg px-3 py-1 border border-border">{pad(remaining.hours)}</span>
        <span className="text-xs text-muted-foreground mt-1">heures</span>
      </div>
      <span className="text-2xl font-bold text-muted-foreground">:</span>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums bg-card rounded-lg px-3 py-1 border border-border">{pad(remaining.minutes)}</span>
        <span className="text-xs text-muted-foreground mt-1">min</span>
      </div>
      <span className="text-2xl font-bold text-muted-foreground">:</span>
      <div className="flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums bg-card rounded-lg px-3 py-1 border border-border">{pad(remaining.seconds)}</span>
        <span className="text-xs text-muted-foreground mt-1">sec</span>
      </div>
    </div>
  )
}
