import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-[3px] focus:ring-ring/50',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        // Semantic surfaces. Tinted background + matching text + a subtle
        // border, so call sites stop reaching for `bg-primary/10
        // text-primary border-primary/20` triplets and the design system
        // owns the contrast.
        success: 'border-success/30 bg-success/15 text-success',
        warning: 'border-warning/30 bg-warning/15 text-warning',
        info: 'border-info/30 bg-info/15 text-info',
        reward: 'border-reward/30 bg-reward/15 text-reward',
        scoreGood: 'border-score-good/30 bg-score-good/15 text-score-good',
        scoreMixed: 'border-score-mixed/30 bg-score-mixed/15 text-score-mixed',
        scoreBad: 'border-score-bad/30 bg-score-bad/15 text-score-bad',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
