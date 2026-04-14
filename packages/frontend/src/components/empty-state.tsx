import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
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
  /** Optional secondary content rendered below the action (checklist, FAQ link, etc.) */
  hint?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action, hint }: EmptyStateProps) {
  const ActionIcon = action?.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-heading font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && (
        <Button
          variant="secondary"
          className="mt-4"
          onClick={action.onClick}
          disabled={action.loading}
        >
          {ActionIcon && <ActionIcon className={`w-4 h-4 ${action.loading ? 'animate-spin' : ''}`} />}
          {action.label}
        </Button>
      )}
      {hint && (
        <div className="mt-6 w-full max-w-sm text-left">
          {hint}
        </div>
      )}
    </motion.div>
  )
}
