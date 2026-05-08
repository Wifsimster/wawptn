import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

/**
 * Compact retention indicator surfaced on the GroupsPage header.
 *
 * Shows the user's best *current* streak across every group, with a
 * tooltip that adds the all-time best for context. Hidden when the
 * user has no streak yet (current < 2) so it doesn't clutter the
 * empty-handed first-run state.
 *
 * Fetches its own data: the badge is the only consumer, the response
 * is tiny, and adding a global Zustand store for one number would be
 * over-engineering. Errors swallow silently — analytics/retention
 * surfaces must never break the page.
 */
export function StreakBadge() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ bestCurrent: number; bestEver: number; activeStreakGroups: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getMyStreaks()
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { /* swallow — never break the header */ })
    return () => { cancelled = true }
  }, [])

  if (!data || data.bestCurrent < 2) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-reward/30 bg-reward/10 px-2.5 py-0.5 text-xs font-semibold text-reward tabular-nums"
          aria-label={t('streak.ariaLabel', { count: data.bestCurrent })}
        >
          <span aria-hidden="true">🔥</span>
          {data.bestCurrent}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs leading-snug">
          <div>{t('streak.tooltipCurrent', { count: data.bestCurrent })}</div>
          {data.bestEver > data.bestCurrent && (
            <div className="text-muted-foreground mt-0.5">
              {t('streak.tooltipBest', { count: data.bestEver })}
            </div>
          )}
          {data.activeStreakGroups > 1 && (
            <div className="text-muted-foreground mt-0.5">
              {t('streak.tooltipGroups', { count: data.activeStreakGroups })}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
