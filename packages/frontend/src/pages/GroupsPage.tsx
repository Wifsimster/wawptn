import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, Crown, Search, X, RefreshCw, Vote, ClipboardPaste } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGroupStore } from '@/stores/group.store'
import { ApiError } from '@/lib/api'
import { track } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { InviteLink } from '@/components/invite-link'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

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

// Hero pick: the group most likely to be acted on right now. Active vote
// always wins; otherwise we fall back to the most-recently-finished session,
// then to creation date. Stable enough that returning users land on the
// same group every time.
function pickHeroGroup(groups: GroupListItem[]): GroupListItem | null {
  if (groups.length === 0) return null
  const sorted = [...groups].sort((a, b) => {
    if (a.activeVoteSession && !b.activeVoteSession) return -1
    if (!a.activeVoteSession && b.activeVoteSession) return 1
    const aTime = a.lastSession?.closedAt ?? a.createdAt
    const bTime = b.lastSession?.closedAt ?? b.createdAt
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })
  return sorted[0] ?? null
}

export function GroupsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('groups.title'))
  const { groups, loading, fetchGroups, createGroup, joinGroup } = useGroupStore()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const touchStartY = useRef(0)
  const mainRef = useRef<HTMLElement>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteResult, setInviteResult] = useState<string | null>(null)
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const extractInviteToken = (raw: string): string => {
    const input = raw.trim()
    if (!input) return input
    const urlMatch = input.match(/\/invite\/([A-Za-z0-9_-]+)/)
    if (urlMatch && urlMatch[1]) return urlMatch[1]
    return input
  }

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

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
    setRefreshing(true)
    await fetchGroups()
    setRefreshing(false)
    setPullDistance(0)
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
      setPullDistance(Math.min(delta * 0.4, 80))
    }
  }, [refreshing])

  const onTouchEnd = useCallback(() => {
    if (pullDistance > 60) {
      handlePullRefresh()
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, handlePullRefresh])

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setCreateError(t('createGroup.required'))
      return
    }
    setCreateError(null)
    try {
      const result = await createGroup({ name: groupName.trim() })
      setGroupName('')
      setInviteResult(result.inviteToken)
      setCreatedGroupId(result.id)
      fetchGroups()
      toast.success(t('createGroup.success'))
      track('group.created', { fromEmptyState: groups.length === 0 })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.create_failed', { reason: 'premium_required' })
        track('premium.upgrade_clicked', { from: 'group_limit' })
        toast.error(t('premium.groupLimitReached', { max: 2 }))
        navigate('/subscription?from=group_limit')
        return
      }
      const msg = err instanceof Error ? err.message : t('createGroup.error')
      setCreateError(msg)
      track('group.create_failed', { reason: 'error' })
      toast.error(msg, {
        action: {
          label: t('common.retry'),
          onClick: () => handleCreate(),
        },
      })
    }
  }

  const handleFinishCreate = () => {
    const id = createdGroupId
    setShowCreate(false)
    setInviteResult(null)
    setCreatedGroupId(null)
    if (id) navigate(`/groups/${id}`)
  }

  const handleJoin = async () => {
    const token = extractInviteToken(inviteToken)
    if (!token) {
      setJoinError(t('joinGroup.required'))
      return
    }
    setJoinError(null)
    try {
      const result = await joinGroup(token)
      setInviteToken('')
      setShowJoin(false)
      fetchGroups()
      navigate(result.activeVoteSession ? `/groups/${result.id}/vote` : `/groups/${result.id}`)
      toast.success(t('joinGroup.success'))
      track('group.joined')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.join_failed', { reason: 'premium_required' })
        toast.error(t('premium.memberLimitReached', { max: 8 }))
        return
      }
      const msg = err instanceof Error ? err.message : t('joinGroup.error')
      setJoinError(msg)
      track('group.join_failed', { reason: 'error' })
      toast.error(msg, {
        action: {
          label: t('common.retry'),
          onClick: () => handleJoin(),
        },
      })
    }
  }

  const handlePasteInvite = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setInviteToken(text)
        setJoinError(null)
      }
    } catch {
      toast.error(t('joinGroup.pasteError'))
    }
  }

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
    <div className="min-h-dvh flex flex-col">
      <AppHeader />

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
          <div className="relative mb-4" role="search">
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
          </div>
        )}

        {/* Create Group Dialog */}
        <ResponsiveDialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open)
            if (!open) {
              setInviteResult(null)
              setCreatedGroupId(null)
              setGroupName('')
              setCreateError(null)
            }
          }}
        >
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                {inviteResult ? t('createGroup.inviteReadyTitle') : t('createGroup.title')}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {inviteResult ? t('createGroup.inviteReadyHint') : t('createGroup.description')}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            {!inviteResult && (
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="group-name" className="text-sm font-medium">
                    {t('createGroup.label')}
                  </label>
                  <Input
                    id="group-name"
                    value={groupName}
                    onChange={(e) => { setGroupName(e.target.value); setCreateError(null) }}
                    placeholder={t('createGroup.placeholder')}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    maxLength={100}
                    autoFocus
                    autoComplete="off"
                    enterKeyHint="done"
                    aria-invalid={!!createError}
                    aria-describedby={createError ? 'group-name-error' : undefined}
                  />
                  {createError && (
                    <p id="group-name-error" role="alert" className="text-sm text-destructive">
                      {createError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => setShowCreate(false)}>
                    {t('common.cancel', 'Annuler')}
                  </Button>
                  <Button onClick={handleCreate}>{t('createGroup.submit')}</Button>
                </div>
              </div>
            )}
            {inviteResult && (
              <InviteLink
                token={inviteResult}
                prominent
                onContinue={handleFinishCreate}
                continueLabel={t('createGroup.goToGroup')}
              />
            )}
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Join Group Dialog */}
        <ResponsiveDialog open={showJoin} onOpenChange={(open) => { setShowJoin(open); if (!open) { setInviteToken(''); setJoinError(null) } }}>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('joinGroup.title')}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t('joinGroup.description')}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="mt-4 space-y-2">
              <label htmlFor="invite-token" className="text-sm font-medium">
                {t('joinGroup.label')}
              </label>
              <div className="flex gap-2">
                <Input
                  id="invite-token"
                  value={inviteToken}
                  onChange={(e) => { setInviteToken(e.target.value); setJoinError(null) }}
                  placeholder={t('joinGroup.placeholder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  maxLength={512}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="go"
                  aria-invalid={!!joinError}
                  aria-describedby={joinError ? 'invite-token-error' : undefined}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePasteInvite}
                  aria-label={t('joinGroup.paste')}
                  title={t('joinGroup.paste')}
                >
                  <ClipboardPaste className="size-4" />
                </Button>
                <Button onClick={handleJoin}>{t('joinGroup.submit')}</Button>
              </div>
              {joinError && (
                <p id="invite-token-error" role="alert" className="text-sm text-destructive">
                  {joinError}
                </p>
              )}
            </div>
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Loading skeleton */}
        {loading ? (
          <div
            className="space-y-3"
            role="status"
            aria-busy="true"
            aria-live="polite"
            aria-label={t('common.loading', 'Chargement…')}
          >
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" style={{ animationDelay: '150ms' }} />
            <Skeleton className="h-14 w-full rounded-lg" style={{ animationDelay: '300ms' }} />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            onCreate={() => setShowCreate(true)}
            onJoin={() => setShowJoin(true)}
          />
        ) : (
          <motion.div
            className="space-y-6"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            {/* Hero card — primary action surface for the group most likely
                to be played tonight. Inline CTA collapses two taps (open
                group → start vote) into one. */}
            {heroGroup && (
              <motion.div variants={fadeUp}>
                <HeroGroupCard group={heroGroup} onAction={goToHeroVote} />
              </motion.div>
            )}

            {/* Other groups — compact rows. No icons, no badges, no chevron.
                The only signal worth surfacing is "vote en cours" because it
                still beats the hero pick when the user has multiple groups. */}
            {filteredOtherGroups.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                  {t('groups.otherGroups')}
                </h2>
                <div className="space-y-1.5">
                  {filteredOtherGroups.map((group) => (
                    <CompactGroupRow key={group.id} group={group} />
                  ))}
                </div>
              </motion.div>
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
            <motion.div variants={fadeUp} className="text-center pt-2">
              <button
                type="button"
                onClick={() => setShowJoin(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <LogIn className="size-3.5" />
                {t('groups.joinWithCode')}
              </button>
            </motion.div>
          </motion.div>
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

      <AppFooter />
    </div>
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
  const isActive = !!group.activeVoteSession

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
      {isActive && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neon/10 px-2 py-0.5 text-[11px] font-semibold text-neon shrink-0">
          <span className="size-1.5 rounded-full bg-neon animate-pulse" aria-hidden="true" />
          {t('groups.voteOngoing')}
        </span>
      )}
    </Link>
  )
}

interface EmptyStateProps {
  onCreate: () => void
  onJoin: () => void
}

function EmptyState({ onCreate, onJoin }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <motion.div
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
    </motion.div>
  )
}
