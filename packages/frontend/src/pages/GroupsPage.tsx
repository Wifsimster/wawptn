import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, LogIn, Users, Gamepad2, Trophy, Crown, Search, X, RefreshCw, ChevronRight, Vote, Sparkles, ClipboardPaste, Hash, Check, Link2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useGroupStore } from '@/stores/group.store'
import { api, ApiError } from '@/lib/api'
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

  // ── Discord binding picker state (part of the create dialog) ────────
  // Three phases drive the picker UI:
  //   'idle'     — user has not clicked "Connecter Discord" yet
  //   'connecting' — OAuth popup is open, waiting for the callback
  //   'ready'    — OAuth succeeded, we can fetch guilds/channels
  // The picker is fully optional; skipping it leaves both IDs null on
  // the POST /groups payload and the group is created without a binding.
  type DiscordPhase = 'idle' | 'connecting' | 'ready'
  const [discordPhase, setDiscordPhase] = useState<DiscordPhase>('idle')
  const [discordGuilds, setDiscordGuilds] = useState<
    { id: string; name: string; iconUrl: string | null; canManage: boolean }[]
  >([])
  const [discordGuildsLoading, setDiscordGuildsLoading] = useState(false)
  const [discordGuildsError, setDiscordGuildsError] = useState<string | null>(null)
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null)
  const [discordChannels, setDiscordChannels] = useState<
    { id: string; name: string; type: number }[]
  >([])
  const [discordChannelsLoading, setDiscordChannelsLoading] = useState(false)
  const [discordChannelsError, setDiscordChannelsError] = useState<string | null>(null)
  const [botInviteUrl, setBotInviteUrl] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const discordPopupRef = useRef<Window | null>(null)

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
      const result = await createGroup({
        name: groupName.trim(),
        discordGuildId: selectedGuildId,
        discordChannelId: selectedChannelId,
      })
      setGroupName('')
      // Keep the dialog open and surface the fresh invite link so the user can
      // invite friends immediately — this is the core adoption loop.
      setInviteResult(result.inviteToken)
      setCreatedGroupId(result.id)
      fetchGroups()
      toast.success(t('createGroup.success'))
      track('group.created', {
        fromEmptyState: groups.length === 0,
        withDiscordBinding: Boolean(selectedGuildId && selectedChannelId),
      })
      // The Discord OAuth session has served its purpose — drop the
      // access token on the server so we do not hold it any longer.
      void api.clearDiscordOAuthSession().catch(() => {})
    } catch (err) {
      if (err instanceof ApiError && err.code === 'premium_required') {
        track('group.create_failed', { reason: 'premium_required' })
        toast.error(t('premium.groupLimitReached', { max: 2 }))
        navigate('/subscription')
        return
      }
      if (err instanceof ApiError && err.code === 'discord_channel_taken') {
        track('group.create_failed', { reason: 'discord_channel_taken' })
        setCreateError(t('createGroup.discordChannelTaken'))
        toast.error(t('createGroup.discordChannelTaken'))
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

  // ── Discord OAuth picker handlers ──────────────────────────────────────
  // 1. Ask the backend for a signed authorize URL
  // 2. Open Discord in a popup; wait for a postMessage from the callback
  //    page we serve at /api/discord/oauth/callback
  // 3. On success, fetch the list of guilds the user can manage
  const handleConnectDiscord = useCallback(async () => {
    setDiscordGuildsError(null)
    setDiscordChannelsError(null)
    setBotInviteUrl(null)
    setSelectedGuildId(null)
    setSelectedChannelId(null)
    try {
      const { url } = await api.getDiscordOAuthAuthorizeUrl()
      setDiscordPhase('connecting')
      const width = 520
      const height = 720
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2)
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2)
      discordPopupRef.current = window.open(
        url,
        'wawptn-discord-oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      )
      if (!discordPopupRef.current) {
        setDiscordPhase('idle')
        toast.error(t('createGroup.discordPopupBlocked'))
      }
    } catch (err) {
      setDiscordPhase('idle')
      const msg = err instanceof ApiError && err.code === 'discord_oauth_disabled'
        ? t('createGroup.discordOAuthDisabled')
        : err instanceof Error
          ? err.message
          : t('createGroup.discordConnectError')
      toast.error(msg)
    }
  }, [t])

  // Listen for the postMessage from the OAuth callback popup. The page
  // we serve at /api/discord/oauth/callback posts either
  // { source: 'wawptn-discord-oauth', ok: true } or
  // { source: 'wawptn-discord-oauth', ok: false, error: '...' }.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { source?: string; ok?: boolean; error?: string } | null
      if (!data || data.source !== 'wawptn-discord-oauth') return
      discordPopupRef.current = null
      if (data.ok) {
        setDiscordPhase('ready')
        // Fetch the user's guilds as soon as the OAuth session is live.
        setDiscordGuildsLoading(true)
        api.listDiscordGuilds()
          .then(({ guilds }) => setDiscordGuilds(guilds))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : t('createGroup.discordConnectError')
            setDiscordGuildsError(msg)
          })
          .finally(() => setDiscordGuildsLoading(false))
      } else {
        setDiscordPhase('idle')
        if (data.error && data.error !== 'access_denied') {
          toast.error(t('createGroup.discordConnectError'))
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [t])

  const handlePickGuild = useCallback(async (guildId: string) => {
    setSelectedGuildId(guildId)
    setSelectedChannelId(null)
    setDiscordChannels([])
    setDiscordChannelsError(null)
    setBotInviteUrl(null)
    setDiscordChannelsLoading(true)
    try {
      const { channels } = await api.listDiscordChannels(guildId)
      setDiscordChannels(channels)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'bot_not_in_guild') {
        const inviteUrl = err.details['inviteUrl']
        if (typeof inviteUrl === 'string') setBotInviteUrl(inviteUrl)
        setDiscordChannelsError(t('createGroup.discordBotNotInGuild'))
      } else {
        const msg = err instanceof Error ? err.message : t('createGroup.discordConnectError')
        setDiscordChannelsError(msg)
      }
    } finally {
      setDiscordChannelsLoading(false)
    }
  }, [t])

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
      navigate(`/groups/${result.id}`)
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
          <h1 className="text-2xl font-heading font-bold tracking-[-0.03em]">{t('groups.title')}</h1>
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
              // Discord picker reset — best-effort server-side cleanup;
              // we fire-and-forget since losing the session is fine.
              setDiscordPhase('idle')
              setDiscordGuilds([])
              setDiscordGuildsError(null)
              setSelectedGuildId(null)
              setDiscordChannels([])
              setDiscordChannelsError(null)
              setBotInviteUrl(null)
              setSelectedChannelId(null)
              void api.clearDiscordOAuthSession().catch(() => {})
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

                {/* Discord binding picker — optional but proposed up-front
                    because Discord binding is now core to the product
                    (decision C4, design meeting 2026-04-14). */}
                <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <Link2 className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t('createGroup.discordSectionTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('createGroup.discordSectionHint')}</p>
                    </div>
                  </div>

                  {discordPhase === 'idle' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={handleConnectDiscord}
                    >
                      {t('createGroup.discordConnect')}
                    </Button>
                  )}

                  {discordPhase === 'connecting' && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {t('createGroup.discordConnecting')}
                    </div>
                  )}

                  {discordPhase === 'ready' && (
                    <div className="space-y-3">
                      {/* Guild picker */}
                      <div className="space-y-1.5">
                        <label htmlFor="discord-guild" className="text-xs font-medium text-muted-foreground">
                          {t('createGroup.discordGuildLabel')}
                        </label>
                        {discordGuildsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            {t('common.loading', 'Chargement…')}
                          </div>
                        ) : discordGuildsError ? (
                          <p className="text-xs text-destructive">{discordGuildsError}</p>
                        ) : discordGuilds.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('createGroup.discordNoGuilds')}</p>
                        ) : (
                          <select
                            id="discord-guild"
                            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            value={selectedGuildId ?? ''}
                            onChange={(e) => {
                              const id = e.target.value
                              if (id) void handlePickGuild(id)
                              else {
                                setSelectedGuildId(null)
                                setDiscordChannels([])
                                setBotInviteUrl(null)
                              }
                            }}
                          >
                            <option value="">{t('createGroup.discordGuildPlaceholder')}</option>
                            {discordGuilds.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Channel picker — only visible once a guild is picked */}
                      {selectedGuildId && (
                        <div className="space-y-1.5">
                          <label htmlFor="discord-channel" className="text-xs font-medium text-muted-foreground">
                            {t('createGroup.discordChannelLabel')}
                          </label>
                          {discordChannelsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              {t('common.loading', 'Chargement…')}
                            </div>
                          ) : discordChannelsError ? (
                            <div className="space-y-2">
                              <p className="text-xs text-destructive">{discordChannelsError}</p>
                              {botInviteUrl && (
                                <a
                                  href={botInviteUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {t('createGroup.discordInviteBot')}
                                </a>
                              )}
                            </div>
                          ) : discordChannels.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('createGroup.discordNoChannels')}</p>
                          ) : (
                            <select
                              id="discord-channel"
                              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                              value={selectedChannelId ?? ''}
                              onChange={(e) => setSelectedChannelId(e.target.value || null)}
                            >
                              <option value="">{t('createGroup.discordChannelPlaceholder')}</option>
                              {discordChannels.map((c) => (
                                <option key={c.id} value={c.id}>#{c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {selectedGuildId && selectedChannelId && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="w-3 h-3 text-primary" />
                          <Hash className="w-3 h-3" />
                          <span className="truncate">
                            {discordChannels.find((c) => c.id === selectedChannelId)?.name}
                          </span>
                          <span className="opacity-50">·</span>
                          <span className="truncate">
                            {discordGuilds.find((g) => g.id === selectedGuildId)?.name}
                          </span>
                        </div>
                      )}
                    </div>
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
      </main>
      <AppFooter />
    </div>
  )
}
