import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, Users, Gamepad2, Trophy, Crown, Search, X, RefreshCw, ChevronRight, Vote, Sparkles, ClipboardPaste } from 'lucide-react'
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
import { PersonaBadge } from '@/components/persona-badge'
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

  // Extract raw token from an invite URL (e.g. https://wawptn.app/invite/abc123 → abc123)
  // Falls back to the raw input if it doesn't look like a URL.
  const extractInviteToken = (raw: string): string => {
    const input = raw.trim()
    if (!input) return input
    const urlMatch = input.match(/\/invite\/([A-Za-z0-9_-]+)/)
    if (urlMatch && urlMatch[1]) return urlMatch[1]
    return input
  }

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = normalize(searchQuery)
    return groups.filter((g) => normalize(g.name).includes(q))
  }, [groups, searchQuery])

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
      // Keep the dialog open and surface the fresh invite link so the user can
      // invite friends immediately — this is the core adoption loop.
      setInviteResult(result.inviteToken)
      setCreatedGroupId(result.id)
      fetchGroups()
      toast.success(t('createGroup.success'))
      track('group.created', { fromEmptyState: groups.length === 0 })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.create_failed', { reason: 'premium_required' })
        toast.error(t('premium.groupLimitReached', { max: 2 }))
        navigate('/subscription')
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
      // Mirror JoinPage: if a vote is already running in the target group,
      // drop the user straight on the ballot instead of walking them
      // through the group detail page first.
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


  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />

      <main
        id="main-content"
        ref={mainRef}
        className="max-w-2xl mx-auto p-4"
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
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              {refreshing ? t('groups.refreshing', 'Actualisation...') : pullDistance > 60 ? t('groups.releaseToRefresh', 'Relâcher pour actualiser') : t('groups.pullToRefresh', 'Tirer pour actualiser')}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <h1 className="text-2xl font-heading font-bold tracking-[-0.03em]">{t('groups.title')}</h1>
          {/* Desktop-only top-right actions. On mobile these are duplicated
              into a thumb-zone bottom bar (below) so the primary CTAs
              aren't stranded in the top-right unreachable zone. */}
          <div className="hidden sm:flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowJoin(true)}>
              <LogIn className="w-4 h-4" />
              {t('groups.join')}
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              {t('groups.create')}
            </Button>
          </div>
        </div>

        {/* Per-group persona du jour lives on each GroupCard below —
            no longer a single global badge at the top of the page. */}

        {/* Search Groups */}
        {groups.length > 3 && (
          <div className="relative mb-4" role="search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
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
                <X className="w-4 h-4" />
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
              <>
                <InviteLink token={inviteResult} />
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleFinishCreate}>
                    {t('createGroup.goToGroup')}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
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
                  <ClipboardPaste className="w-4 h-4" />
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

        {/* Groups List */}
        {loading ? (
          <div
            className="space-y-3"
            role="status"
            aria-busy="true"
            aria-live="polite"
            aria-label={t('common.loading', 'Chargement…')}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                className="h-[72px] w-full rounded-lg"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <motion.div
            className="py-10 sm:py-16 relative overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-heading font-extrabold text-[20vw] sm:text-[12rem] leading-none landing-question-mark pointer-events-none select-none"
            >
              ?
            </span>
            <div className="relative z-10 text-center max-w-xl mx-auto">
              <h3 className="text-2xl font-heading font-bold tracking-[-0.02em] mb-2">
                {t('groups.welcomeTitle')}
              </h3>
              <p className="text-muted-foreground mb-8">
                {t('groups.welcomeSubtitle')}
              </p>

              <ol className="text-left space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t('groups.welcomeStep1')}</p>
                    <p className="text-xs text-muted-foreground">{t('groups.welcomeStep1Desc')}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neon/10 border border-neon/20 text-neon shrink-0">
                    <Vote className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t('groups.welcomeStep2')}</p>
                    <p className="text-xs text-muted-foreground">{t('groups.welcomeStep2Desc')}</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-reward/10 border border-reward/20 text-reward shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t('groups.welcomeStep3')}</p>
                    <p className="text-xs text-muted-foreground">{t('groups.welcomeStep3Desc')}</p>
                  </div>
                </li>
              </ol>

              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Button size="lg" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" />
                  {t('groups.welcomeCta')}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setShowJoin(true)}>
                  <LogIn className="w-4 h-4" />
                  {t('groups.join')}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : filteredGroups.length === 0 && searchQuery ? (
          <motion.div
            className="text-center py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-sm text-muted-foreground mb-2">{t('groups.noSearchResults')}</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-sm text-primary hover:underline"
            >
              {t('groups.clearSearch')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            className="space-y-3"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            {filteredGroups.map((group) => (
              <motion.div key={group.id} variants={fadeUp}>
                <Link to={`/groups/${group.id}`} className="block group/card">
                  <Card
                    className={cn(
                      'p-4 card-hover-glow',
                      group.role === 'owner' && 'border-primary/15',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold flex items-center gap-1.5">
                          {group.name}
                          {group.role === 'owner' && (
                            <Crown className="w-4 h-4 text-reward shrink-0" />
                          )}
                          {group.todayPersona && (
                            <PersonaBadge
                              variant="compact"
                              persona={group.todayPersona}
                              className="ml-1"
                            />
                          )}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {group.memberCount}
                          </span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="flex items-center gap-1">
                            <Gamepad2 className="w-3 h-3" />
                            {t('groups.commonGames', { count: group.commonGameCount })}
                          </span>
                          {group.lastSession && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="flex items-center gap-1 truncate">
                                <Trophy className="w-3 h-3 shrink-0" />
                                <span className="truncate">{group.lastSession.gameName}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/20 shrink-0 transition-all duration-300 group-hover/card:translate-x-0.5 group-hover/card:text-muted-foreground/50" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Mobile: fixed thumb-zone action bar. Mirrors the pattern used on
            GroupPage (line ~579) so the two list/detail entry points behave
            the same on phones. Desktop keeps the top-right buttons above. */}
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-background/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <Button
              variant="secondary"
              onClick={() => setShowJoin(true)}
              className="flex-1 h-12 gap-2"
            >
              <LogIn className="w-4 h-4" />
              {t('groups.join')}
            </Button>
            <Button
              onClick={() => setShowCreate(true)}
              className="flex-1 h-12 gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('groups.create')}
            </Button>
          </div>
        </div>
        {/* Spacer so the last group card isn't covered by the bottom bar. */}
        <div className="h-20 sm:hidden" />
      </main>
      <AppFooter />
    </div>
  )
}
