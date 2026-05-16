import { Sparkles, Users, History, BarChart3, Settings, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type GroupTab = 'tonight' | 'members' | 'history' | 'stats' | 'settings'

const GROUP_TABS: readonly GroupTab[] = ['tonight', 'members', 'history', 'stats', 'settings']

const TAB_META: Record<GroupTab, { icon: LucideIcon; labelKey: string }> = {
  tonight: { icon: Sparkles, labelKey: 'group.tabTonight' },
  members: { icon: Users, labelKey: 'group.tabMembers' },
  history: { icon: History, labelKey: 'group.tabHistory' },
  stats: { icon: BarChart3, labelKey: 'group.tabStats' },
  settings: { icon: Settings, labelKey: 'group.tabSettings' },
}

interface GroupTabsProps {
  active: GroupTab
  onChange: (tab: GroupTab) => void
  /** When true, the Tonight tab carries a live-vote indicator so an
   *  in-progress vote is visible from any other tab. */
  voteLive?: boolean
}

/** Persistent, labelled navigation for the group detail page. Replaces the
 *  old hidden mobile bottom-sheet + desktop sidebar so every group feature
 *  has a visible home on both viewports. */
export function GroupTabs({ active, onChange, voteLive = false }: GroupTabsProps) {
  const { t } = useTranslation()

  return (
    <div
      role="tablist"
      aria-label={t('group.tabsLabel')}
      className="flex gap-1 overflow-x-auto scrollbar-none border-b border-border -mx-3 px-3 sm:mx-0 sm:px-0"
    >
      {GROUP_TABS.map((tab) => {
        const { icon: Icon, labelKey } = TAB_META[tab]
        const isActive = active === tab
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 -mb-px px-3 py-2.5 text-sm font-medium min-h-[44px] transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(labelKey)}
            {tab === 'tonight' && voteLive && (
              <span
                className="size-1.5 rounded-full bg-neon animate-pulse"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
