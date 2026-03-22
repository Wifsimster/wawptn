import * as React from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-md bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]', className)}
      {...props}
    />
  )
}

export { Skeleton }
