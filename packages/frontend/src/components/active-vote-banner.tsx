import { useMatch, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGroupStore } from '@/stores/group.store'
import { Button } from '@/components/ui/button'

/**
 * App-wide banner surfacing any group with a live vote. Rendered by
 * AppLayout so the "join the vote" call to action follows the user across
 * every standard page. The group whose detail page is currently open is
 * excluded — that page already has its own join CTA.
 */
export function ActiveVoteBanner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const groups = useGroupStore((s) => s.groups)
  const groupMatch = useMatch('/groups/:id')
  const currentGroupId = groupMatch?.params.id ?? null

  const activeGroups = groups.filter(
    (g) => g.activeVoteSession && g.id !== currentGroupId,
  )
  if (activeGroups.length === 0) return null

  const single = activeGroups.length === 1 ? activeGroups[0]! : null

  return (
    <div className="sticky top-14 z-40 border-b border-neon/30 bg-neon/10 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 sm:px-4 py-2">
        <span
          className="size-2 shrink-0 rounded-full bg-neon animate-pulse"
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {single
            ? t('voteBanner.single', { name: single.name })
            : t('voteBanner.multiple', { count: activeGroups.length })}
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={() => navigate(single ? `/groups/${single.id}/vote` : '/')}
        >
          {single ? t('voteBanner.join') : t('voteBanner.view')}
        </Button>
      </div>
    </div>
  )
}
