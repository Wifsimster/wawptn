import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
    loading?: boolean
    icon?: LucideIcon
  }
  /** Secondary, less prominent action — shown next to the primary action. */
  secondaryAction?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  /** Visual register for the state. `neutral` is the default,
   *  `warning` for invite-token problems / dead links,
   *  `celebrate` for milestones (first vote completed, etc.). */
  tone?: 'neutral' | 'warning' | 'celebrate'
  /** Optional secondary content rendered below the action (checklist, FAQ link, etc.) */
  hint?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  hint,
}: EmptyStateProps) {
  const ActionIcon = action?.icon
  const SecondaryActionIcon = secondaryAction?.icon

  const ringTone = tone === 'warning'
    ? 'text-reward'
    : tone === 'celebrate'
      ? 'text-neon'
      : 'text-foreground/30'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative flex flex-col items-center justify-center py-12 px-4 text-center overflow-hidden"
    >
      {/* Brand "?" watermark — same motif as LandingPage / GroupsPage welcome.
          aria-hidden so screen readers don't read a meaningless character. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-heading font-extrabold leading-none pointer-events-none select-none',
          'text-[18vw] sm:text-[10rem] landing-question-mark',
          tone === 'warning' && 'opacity-60',
          tone === 'celebrate' && 'opacity-60',
        )}
      >
        ?
      </span>

      <div className="relative z-10 flex flex-col items-center max-w-sm">
        <div className={cn(
          'w-14 h-14 rounded-full bg-card/60 border border-border/60 backdrop-blur-sm flex items-center justify-center mb-4',
          ringTone,
        )}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-heading font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>

        {(action || secondaryAction) && (
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
            {action && (
              <Button
                onClick={action.onClick}
                disabled={action.loading}
              >
                {ActionIcon && <ActionIcon className={`w-4 h-4 ${action.loading ? 'animate-spin' : ''}`} />}
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant="ghost"
                onClick={secondaryAction.onClick}
              >
                {SecondaryActionIcon && <SecondaryActionIcon className="w-4 h-4" />}
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}

        {hint && (
          <div className="mt-6 w-full text-left">
            {hint}
          </div>
        )}
      </div>
    </motion.div>
  )
}
