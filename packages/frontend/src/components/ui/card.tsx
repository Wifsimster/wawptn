import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Padding scale used by CardHeader / CardContent / CardFooter. Default
 *  matches the historical `p-4`; `none` lets a parent take over (e.g. a
 *  card whose content is a full-bleed image), `sm` for compact list rows,
 *  `lg` for marketing surfaces. Centralising the variants keeps every
 *  Card-shaped surface on the same rhythm. */
const paddingVariants = cva('', {
  variants: {
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: { padding: 'md' },
})

type PaddingProps = VariantProps<typeof paddingVariants>

function Card({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="card"
      className={cn('rounded-xl border border-border bg-card/80 backdrop-blur-sm text-card-foreground shadow-1', className)}
      {...props}
    />
  )
}

function CardHeader({
  className,
  padding,
  ref,
  ...props
}: React.ComponentProps<'div'> & PaddingProps) {
  return (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn('flex flex-col space-y-1.5', paddingVariants({ padding }), className)}
      {...props}
    />
  )
}

function CardTitle({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn('font-heading font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}

function CardContent({
  className,
  padding,
  ref,
  ...props
}: React.ComponentProps<'div'> & PaddingProps) {
  // CardContent historically zeros its top padding when paired with a
  // CardHeader above (the header already padded the top). Preserve that
  // behavior by adding `pt-0` whenever a non-`none` padding is requested.
  const padded = padding !== 'none'
  return (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn(paddingVariants({ padding }), padded && 'pt-0', className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  padding,
  ref,
  ...props
}: React.ComponentProps<'div'> & PaddingProps) {
  const padded = padding !== 'none'
  return (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn('flex items-center', paddingVariants({ padding }), padded && 'pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
