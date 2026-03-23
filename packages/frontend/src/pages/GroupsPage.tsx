import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, Users, Gamepad2, Trophy, Crown, Search, X, RefreshCw, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGroupStore } from '@/stores/group.store'
import { ApiError } from '@/lib/api'
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
  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = normalize(searchQuery)
    return groups.filter((g) => normalize(g.name).includes(q))
  }, [groups, searchQuery])

  useEffect(() => {
    fetchGroups()
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
      await createGroup(groupName.trim())
      setGroupName('')
      setShowCreate(false)
      fetchGroups()
      toast.success(t('createGroup.success'))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        toast.error(t('premium.groupLimitReached', { max: 2 }))
        navigate('/subscription')
        return
      }
      const msg = err instanceof Error ? err.message : t('createGroup.error')
      setCreateError(msg)
      toast.error(msg)
    }
  }

  const handleJoin = async () => {
    if (!inviteToken.trim()) {
      setJoinError(t('joinGroup.required'))
      return
    }
    setJoinError(null)
    try {
      const result = await joinGroup(inviteToken.trim())
      setInviteToken('')
      setShowJoin(false)
      fetchGroups()
      navigate(`/groups/${result.id}`)
      toast.success(t('joinGroup.success'))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        toast.error(t('premium.memberLimitReached', { max: 8 }))
        return
      }
      const msg = err instanceof Error ? err.message : t('joinGroup.error')
      setJoinError(msg)
      toast.error(msg)
    }
  }


  return (
    <div className="min-h-screen flex flex-col">
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
          <h2 className="text-2xl font-heading font-bold tracking-[-0.03em]">{t('groups.title')}</h2>
          <div className="flex gap-2">
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
        <ResponsiveDialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setInviteResult(null) }}>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('createGroup.title')}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t('createGroup.description')}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="mt-4 space-y-2">
              <label htmlFor="group-name" className="text-sm font-medium">
                {t('createGroup.label')}
              </label>
              <div className="flex gap-2">
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
                <Button onClick={handleCreate}>{t('createGroup.submit')}</Button>
              </div>
              {createError && (
                <p id="group-name-error" role="alert" className="text-sm text-destructive">
                  {createError}
                </p>
              )}
            </div>
            {inviteResult && <InviteLink token={inviteResult} />}
          </ResponsiveDialogContent>
        </ResponsiveDialog>

        {/* Join Group Dialog */}
        <ResponsiveDialog open={showJoin} onOpenChange={setShowJoin}>
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
                  maxLength={128}
                  autoFocus
                  aria-invalid={!!joinError}
                  aria-describedby={joinError ? 'invite-token-error' : undefined}
                />
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
          <div className="space-y-3">
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
            className="text-center py-16 relative overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-heading font-extrabold text-[20vw] sm:text-[12rem] leading-none landing-question-mark pointer-events-none select-none">
              ?
            </span>
            <div className="relative z-10">
              <h3 className="text-xl font-semibold mb-2">{t('groups.noGroups')}</h3>
              <p className="text-muted-foreground mb-6">{t('groups.noGroupsHint')}</p>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={() => setShowJoin(true)}>
                  <LogIn className="w-4 h-4" />
                  {t('groups.join')}
                </Button>
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" />
                  {t('groups.create')}
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
      </main>
      <AppFooter />
    </div>
  )
}
