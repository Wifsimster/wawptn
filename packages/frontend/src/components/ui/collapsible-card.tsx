import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'

interface CollapsibleCardProps {
  title: string
  icon: LucideIcon
  /** Whether the panel starts open. Stats-style surfaces default to open. */
  defaultExpanded?: boolean
  children: ReactNode
}

/** A Card whose body can be folded away behind its header. Shared so every
 *  collapsible surface keeps the same header, chevron and a11y wiring
 *  (`aria-expanded` / `aria-controls`, a 44px touch target, a unique id). */
export function CollapsibleCard({ title, icon: Icon, defaultExpanded = true, children }: CollapsibleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const panelId = useId()

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 min-h-[44px]"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          <h2 className="font-semibold flex items-center gap-2 text-sm">
            <Icon className="size-4" aria-hidden="true" />
            {title}
          </h2>
          {expanded
            ? <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
            : <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />}
        </button>
      </CardHeader>
      {expanded && <CardContent id={panelId}>{children}</CardContent>}
    </Card>
  )
}
