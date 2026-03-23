import * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="card"
      className={cn('rounded-xl border border-border bg-card/80 backdrop-blur-sm text-card-foreground shadow-[0_2px_12px_oklch(0_0_0_/_0.15)]', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-header" className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
  )
}

function CardTitle({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-title" className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
}

function CardDescription({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}

function CardContent({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-content" className={cn('p-4 pt-0', className)} {...props} />
  )
}

function CardFooter({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-footer" className={cn('flex items-center p-4 pt-0', className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
