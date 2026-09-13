import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Mobile-first sizing. The size variants set a *minimum* height rather than a
// fixed one, and the base no longer forces `whitespace-nowrap`: French labels
// ("Passer en Premium — 2,99 €/mois", "Se connecter avec Steam") are long
// enough that a nowrap button pushed its own container past the viewport on a
// 320-360px screen instead of wrapping. Buttons short enough to fit render
// exactly as before — one line at the same 44/48px height.
const buttonVariants = cva(
  'inline-flex max-w-full items-center justify-center gap-2 text-center rounded-lg text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] active:transition-transform active:duration-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85 shadow-glow hover:shadow-[0_0_28px_oklch(0.55_0.27_270_/_0.25)]',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-white/[0.04]',
        ghost: 'hover:bg-secondary text-muted-foreground hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        steam: 'bg-steam text-steam-foreground hover:bg-steam-light shadow-[0_4px_20px_oklch(0.237_0.029_238_/_0.3)] hover:shadow-[0_6px_28px_oklch(0.237_0.029_238_/_0.45)] hover:translate-y-[-1px] active:translate-y-[0px]',
      },
      size: {
        default: 'min-h-[44px] px-4 py-2',
        sm: 'min-h-[44px] px-3 py-1.5 text-xs',
        lg: 'min-h-[48px] px-8 py-3 text-base',
        icon: 'size-10 min-h-[44px] min-w-[44px] shrink-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
}

// `buttonVariants` is intentionally not re-exported — no consumer needs it,
// and re-exporting non-component values from a component module trips the
// react-refresh/only-export-components lint rule. If a call site ever
// genuinely needs the cva variants, hoist them into a sibling file.
export { Button }
