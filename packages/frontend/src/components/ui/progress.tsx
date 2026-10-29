import * as React from 'react'
import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  max = 100,
  ref,
  ...props
}: React.ComponentProps<'div'> & { value: number; max?: number }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div
      ref={ref}
      data-slot="progress"
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <progress value={value} max={max} className="sr-only" />
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export { Progress }
