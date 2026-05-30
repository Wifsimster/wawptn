import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, Crown, Search, X, RefreshCw, Vote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { m, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGroupStore } from '@/stores/group.store'
import { track } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { CreateGroupDialog } from './CreateGroupDialog'
import { JoinGroupDialog } from './JoinGroupDialog'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

type GroupListItem = ReturnType<typeof useGroupStore.getState>['groups'][number]

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Hero pick: the group most likely to be acted on right now. Active vote
// always wins; otherwise we fall back to the most-recently-finished session,
// then to creation date. Stable enough that returning users land on the
// same group every time.
function pickHeroGroup(groups: GroupListItem[]): GroupListItem | null {
  if (groups.length === 0) return null
  const sorted = groups.toSorted((a, b) => {
    if (a.activeVoteSession && !b.activeVoteSession) return -1
    if (!a.activeVoteSession && b.activeVoteSession) return 1
    const aTime = a.lastSession?.closedAt ?? a.createdAt
    const bTime = b.lastSession?.closedAt ?? b.createdAt
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })
  return sorted[0] ?? null
}

// Pull-to-refresh state lives as one unit: the spinner flag and the drag
// distance always change together (a drag sets the distance; a release either
// refreshes or resets both). A reducer keeps the two in lockstep.
interface PullState {
  refreshing: boolean
  distance: number
}

type PullAction =
  | { type: 'drag'; distance: number }
  | { type: 'refreshStart' }
  | { type: 'refreshEnd' }
  | { type: 'reset' }

function pullReducer(state: PullState, action: PullAction): PullState {
  switch (action.type) {
    case 'drag':
      return { ...state, distance: action.distance }
    case 'refreshStart':
      return { refreshing: true, distance: state.distance }
    case 'refreshEnd':
      return { refreshing: false, distance: 0 }
    case 'reset':
      return { ...state, distance: 0 }
  }
}

export function GroupsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useDocumentTitle(t('groups.title'))
  const { groups, loading, fetchGroups } = useGroupStore()
  const [pull, dispatchPull] = useReducer(pullReducer, { refreshing: false, distance: 0 })
  const { refreshing, distance: pullDistance } = pull
  const touchStartY = useRef(0)
  const mainRef = useRef<HTMLElement>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const heroGroup = useMemo(() => pickHeroGroup(groups), [groups])
  const otherGroups = useMemo(
    () => (heroGroup ? groups.filter((g) => g.id !== heroGroup.id) : []),
    [groups, heroGroup],
  )
  const filteredOtherGroups = useMemo(() => {
    if (!searchQuery.trim()) return otherGroups
    const q = normalize(searchQuery)
    return otherGroups.filter((g) => normalize(g.name).includes(q))
  }, [otherGroups, searchQuery])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await fetchGroups()
      } catch {
        // errors are surfaced via store/toast; swallow here to avoid unhandled rejections
      }
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [fetchGroups])

  const handlePullRefresh = useCallback(async () => {
    dispatchPull({ type: 'refreshStart' })
    await fetchGroups()
    dispatchPull({ type: 'refreshEnd' })
  }, [fetchGroups])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0]!.clientY
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (refreshing || window.scrollY > 0) return
    const delta = e.touches[0]!.clientY - touchStartY.current
    if (delta > 0) {
      dispatchPull({ type: 'drag', distance: Math.min(delta * 0.4, 80) })
    }
  }, [refreshing])

  const onTouchEnd = useCallback(() => {
    if (pullDistance > 60) {
      handlePullRefresh()
    } else {
      dispatchPull({ type: 'reset' })
    }
  }, [pullDistance, handlePullRefresh])

  const goToHeroVote = useCallback(() => {
    if (!heroGroup) return
    if (heroGroup.activeVoteSession) {
      track('group.hero_join_vote')
      navigate(`/groups/${heroGroup.id}/vote`)
    } else {
      // Hand off to GroupPage's vote-setup flow via a query param so the
      // dashboard stays free of the participant-picker dialog. GroupPage
      // reads ?startVote=1 once members have loaded and opens the dialog.
      track('group.hero_start_vote')
      navigate(`/groups/${heroGroup.id}?startVote=1`)
    }
  }, [heroGroup, navigate])

  return (
    <>
      <main
        id="main-content"
        ref={mainRef}
        className="max-w-2xl mx-auto p-4 w-full"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || refreshing) && (
          <div
            className="flex justify-center overflow-hidden transition-all"
            style={{ height: refreshing ? 40 : pullDistance }}
          >
            <div className={cn(
              'flex items-center gap-2 text-xs text-muted-foreground',
              refreshing && 'animate-pulse',
            )}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              {refreshing ? t('groups.refreshing', 'Actualisation...') : pullDistance > 60 ? t('groups.releaseToRefresh', 'Relâcher pour actualiser') : t('groups.pullToRefresh', 'Tirer pour actualiser')}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-6">
          <h1 className="text-2xl font-heading font-bold tracking-[-0.03em]">{t('groups.title')}</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
            aria-label={t('groups.create')}
            title={t('groups.create')}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('groups.create')}</span>
          </Button>
        </div>

        {/* Search — only useful past a handful of groups. */}
        {otherGroups.length > 7 && (
          <search className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('groups.searchGroups')}
              aria-label={t('groups.searchGroups')}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('groups.clearSearch')}
              >
                <X className="size-4" />
              </button>
            )}
          </search>
        )}

        <CreateGroupDialog open={showCreate} onOpenChange={setShowCreate} groupCount={groups.length} />

        <JoinGroupDialog open={showJoin} onOpenChange={setShowJoin} />

        {/* Loading skeleton — only on the first load. A background refetch
            (e.g. the global vote-banner sync) keeps the list on screen. */}
        {loading && groups.length === 0 ? (
          <output
            className="block space-y-3"
            aria-busy="true"
            aria-live="polite"
            aria-label={t('common.loading', 'Chargement…')}
          >
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" style={{ animationDelay: '150ms' }} />
            <Skeleton className="h-14 w-full rounded-lg" style={{ animationDelay: '300ms' }} />
          </output>
        ) : groups.length === 0 ? (
          <EmptyState
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
          />
        ) : (
          <m.div
            className="space-y-6"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            {/* Hero card — primary action surface for the group most likely
                to be played tonight. Inline CTA collapses two taps (open
                group → start vote) into one. */}
            {heroGroup && (
              <m.div variants={fadeUp}>
                <HeroGroupCard group={heroGroup} onAction={goToHeroVote} />
              </m.div>
            )}

            {/* Other groups — compact rows. No icons, no badges, no chevron.
                The only signal worth surfacing is "vote en cours" because it
                still beats the hero pick when the user has multiple groups. */}
            {filteredOtherGroups.length > 0 && (
              <m.div variants={fadeUp} className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                  {t('groups.otherGroups')}
                </h2>
                <div className="space-y-1.5">
                  {filteredOtherGroups.map((group) => (
                    <CompactGroupRow key={group.id} group={group} />
                  ))}
                </div>
              </m.div>
            )}

            {filteredOtherGroups.length === 0 && otherGroups.length > 0 && searchQuery && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">{t('groups.noSearchResults')}</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-primary hover:underline"
                >
                  {t('groups.clearSearch')}
                </button>
              </div>
            )}

            {/* Demoted Join — present but quiet. Most users open this page
                to act inside an existing group, not to join a new one. */}
            <m.div variants={fadeUp} className="text-center pt-2">
              <button
                type="button"
                onClick={() => setShowJoin(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <LogIn className="size-3.5" />
                {t('groups.joinWithCode')}
              </button>
            </m.div>
          </m.div>
        )}

        {/* Spacer so the last row isn't covered by the mobile bottom bar. */}
        {heroGroup && <div className="h-24 sm:hidden" />}
      </main>

      {/* Mobile thumb-zone bar — mirrors the hero CTA so the primary action
          stays reachable when the hero scrolls off-screen. The previous
          Create/Join pair lived here and stole the prime real estate from
          the action returning users actually want. */}
      {heroGroup && !loading && groups.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex max-w-2xl mx-auto">
            <Button
              onClick={goToHeroVote}
              className={cn(
                'flex-1 h-12 gap-2 font-semibold',
                heroGroup.activeVoteSession && 'animate-pulse',
              )}
            >
              <Vote className="size-4" />
              {heroGroup.activeVoteSession
                ? t('groups.joinVote')
                : t('groups.startVote')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

interface HeroGroupCardProps {
  group: GroupListItem
  onAction: () => void
}

function HeroGroupCard({ group, onAction }: HeroGroupCardProps) {
  const { t } = useTranslation()
  const isActive = !!group.activeVoteSession

  return (
    <Card
      className={cn(
        'p-5 sm:p-6 relative overflow-hidden card-hover-glow',
        isActive
          ? 'border-neon/40 shadow-[0_0_24px_-8px_rgb(var(--neon)/0.45)]'
          : 'border-primary/15',
      )}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-neon to-transparent animate-pulse"
        />
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <Link
            to={`/groups/${group.id}`}
            className="inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <h2 className="text-xl sm:text-2xl font-heading font-bold tracking-[-0.02em] truncate">
              {group.name}
            </h2>
            {group.role === 'owner' && (
              <Crown className="size-4 text-reward shrink-0" aria-label={t('group.roleOwner', 'propriétaire')} />
            )}
          </Link>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('groups.membersCount', { count: group.memberCount })}
          </p>
        </div>

        {isActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/10 px-2.5 py-1 text-xs font-semibold text-neon shrink-0">
            <span className="size-1.5 rounded-full bg-neon animate-pulse" aria-hidden="true" />
            {t('groups.voteOngoing')}
          </span>
        )}
      </div>

      <Button
        size="lg"
        onClick={onAction}
        className={cn(
          'w-full h-12 gap-2 font-semibold',
          isActive && 'animate-pulse',
        )}
      >
        <Vote className="size-4" />
        {isActive ? t('groups.joinVote') : t('groups.startVote')}
      </Button>
    </Card>
  )
}

interface CompactGroupRowProps {
  group: GroupListItem
}

function CompactGroupRow({ group }: CompactGroupRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isActive = !!group.activeVoteSession

  // No live vote: the whole row is one link to the group page, where the
  // prominent "tonight" CTA lives.
  if (!isActive) {
    return (
      <Link
        to={`/groups/${group.id}`}
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/40 transition-colors',
          group.role === 'owner' && 'border-l-2 border-l-reward/40',
        )}
      >
        <div className="min-w-0 flex-1">
          <span className="font-medium truncate block">{group.name}</span>
          <span className="text-xs text-muted-foreground">
            {t('groups.membersCount', { count: group.memberCount })}
          </span>
        </div>
      </Link>
    )
  }

  // A vote is live: surface a direct "join" shortcut so the user doesn't
  // have to open the group page and hunt for it.
  return (
    <div
      className={cn(
        'flex items-center gap-3 pl-4 pr-2 py-2 rounded-lg border border-neon/40 bg-neon/5',
        group.role === 'owner' && 'border-l-2 border-l-reward/40',
      )}
    >
      <Link
        to={`/groups/${group.id}`}
        className="min-w-0 flex-1 py-1 hover:opacity-80 transition-opacity"
      >
        <span className="font-medium truncate block">{group.name}</span>
        <span className="text-xs text-muted-foreground">
          {t('groups.membersCount', { count: group.memberCount })}
        </span>
      </Link>
      <Button
        size="sm"
        onClick={() => {
          track('group.row_join_vote')
          navigate(`/groups/${group.id}/vote`)
        }}
        className="shrink-0 h-9 gap-1.5 animate-pulse"
      >
        <Vote className="size-3.5" />
        {t('groups.joinVote')}
      </Button>
    </div>
  )
}

interface EmptyStateProps {
  onCreate: () => void
  onJoin: () => void
}

function EmptyState({ onCreate, onJoin }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <m.div
      className="py-12 sm:py-20 text-center max-w-md mx-auto"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2 className="text-2xl font-heading font-bold tracking-[-0.02em] mb-2">
        {t('groups.welcomeTitle')}
      </h2>
      <p className="text-muted-foreground mb-8">
        {t('groups.welcomeSubtitle')}
      </p>

      <Button size="lg" onClick={onCreate} className="w-full sm:w-auto h-12 gap-2 font-semibold">
        <Plus className="size-4" />
        {t('groups.welcomeCta')}
      </Button>

      <div className="mt-4">
        <button
          type="button"
          onClick={onJoin}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
        >
          <LogIn className="size-3.5" />
          {t('groups.joinWithCode')}
        </button>
      </div>
    </m.div>
  )
}
