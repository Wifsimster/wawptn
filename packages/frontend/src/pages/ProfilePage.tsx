import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowLeft, RefreshCw, ExternalLink, Check, Clock,
  Gamepad2, Link, Unlink, AlertTriangle, Timer, Trophy,
} from 'lucide-react'
import { PlatformIcon } from '@/components/icons/platforms'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

interface Platform {
  id: string
  name: string
  connected: boolean
  comingSoon?: boolean
  linkable?: boolean
  syncable?: boolean
  needsRelink?: boolean
  accountId?: string | null
  gameCount?: number
  totalPlaytimeMinutes?: number
  lastSyncedAt?: string | null
  profileUrl?: string | null
}

interface TopGame {
  gameName: string
  steamAppId: number
  headerImageUrl: string | null
  playtimeForever: number
}

interface Profile {
  id: string
  steamId: string
  displayName: string
  avatarUrl: string
  profileUrl: string | null
  libraryVisible: boolean
  createdAt: string
  platforms: Platform[]
  topGames?: TopGame[]
}

/* ── Helpers ── */

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 1000) return `${hours}h`
  return `${(hours / 1000).toFixed(1)}kh`
}

function formatStatValue(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`
  return new Intl.NumberFormat('fr-FR').format(value)
}

/* ── Config ── */

const PLATFORM_NAMES: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG',
  ubisoft: 'Ubisoft Connect',
}

const PLATFORM_ACCENT: Record<string, string> = {
  steam: 'oklch(0.45 0.08 238)',
  epic: 'oklch(0.65 0.01 270)',
  gog: 'oklch(0.55 0.18 310)',
  ubisoft: 'oklch(0.55 0.15 250)',
}

/* ── Animation variants ── */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1, scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

/* ── Component ── */

export function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getProfile()
      setProfile(data)
    } catch {
      toast.error(t('error.description'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Handle OAuth callback query params
  useEffect(() => {
    const linked = searchParams.get('linked')
    const error = searchParams.get('error')
    const epic = searchParams.get('epic')
    const gog = searchParams.get('gog')

    if (linked) {
      toast.success(t('profile.platformLinked', { platform: PLATFORM_NAMES[linked] || linked }))
      setSearchParams({}, { replace: true })
      loadProfile()
    } else if (epic === 'success') {
      toast.success(t('profile.platformLinked', { platform: 'Epic Games' }))
      setSearchParams({}, { replace: true })
      loadProfile()
    } else if (epic === 'error') {
      const reason = searchParams.get('reason')
      if (reason === 'already_linked') {
        toast.error(t('profile.accountTaken'))
      } else {
        toast.error(t('profile.linkError'))
      }
      setSearchParams({}, { replace: true })
    } else if (gog === 'success') {
      toast.success(t('profile.platformLinked', { platform: 'GOG' }))
      setSearchParams({}, { replace: true })
      loadProfile()
    } else if (gog === 'error') {
      const reason = searchParams.get('reason')
      if (reason === 'already_linked') {
        toast.error(t('profile.accountTaken'))
      } else {
        toast.error(t('profile.linkError'))
      }
      setSearchParams({}, { replace: true })
    } else if (error === 'already_linked') {
      toast.info(t('profile.alreadyLinked'))
      setSearchParams({}, { replace: true })
    } else if (error === 'account_taken') {
      toast.error(t('profile.accountTaken'))
      setSearchParams({}, { replace: true })
    } else if (error === 'link_failed' || error === 'link_denied') {
      toast.error(t('profile.linkError'))
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, t, loadProfile])

  // Computed aggregate stats
  const stats = useMemo(() => {
    if (!profile) return { games: 0, hours: 0, platforms: 0 }
    const connected = profile.platforms.filter(p => p.connected && !p.needsRelink)
    return {
      games: connected.reduce((sum, p) => sum + (p.gameCount || 0), 0),
      hours: Math.floor(connected.reduce((sum, p) => sum + (p.totalPlaytimeMinutes || 0), 0) / 60),
      platforms: connected.length,
    }
  }, [profile])

  function handleConnect(platformId: string) {
    window.location.href = `/api/auth/${platformId}/link`
  }

  async function handleUnlink(platformId: string) {
    setUnlinking(platformId)
    try {
      await api.unlinkPlatform(platformId)
      toast.success(t('profile.platformUnlinked', { platform: PLATFORM_NAMES[platformId] || platformId }))
      loadProfile()
    } catch {
      toast.error(t('profile.unlinkError'))
    } finally {
      setUnlinking(null)
    }
  }

  async function handleSync(platformId: string = 'steam') {
    setSyncingPlatform(platformId)
    try {
      if (platformId === 'steam') {
        await api.syncProfile()
      } else {
        await api.syncPlatform(platformId)
      }
      toast.success(t('profile.syncSuccess'))
      setTimeout(loadProfile, 3000)
    } catch {
      toast.error(t('profile.syncError'))
    } finally {
      setSyncingPlatform(null)
    }
  }

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto p-4 space-y-6">
          <div className="flex items-center gap-5">
            <Skeleton className="w-20 h-20 rounded-full shrink-0" />
            <div className="space-y-2.5 flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[5.5rem] rounded-xl" />)}
          </div>
          <div className="space-y-3 pt-2">
            <Skeleton className="h-4 w-48" />
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[4.5rem] rounded-xl" />)}
          </div>
        </main>
      </div>
    )
  }

  if (!profile) return null

  const crownGame = profile.topGames?.[0]
  const otherGames = profile.topGames?.slice(1)

  return (
    <div className="min-h-screen">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <motion.main
        id="main-content"
        className="max-w-2xl mx-auto p-4 space-y-8 pb-12"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        {/* ── Hero: Avatar + Identity ── */}
        <motion.div variants={fadeUp} className="flex items-center gap-5">
          <div className="profile-avatar-ring shrink-0">
            <Avatar className="w-20 h-20 ring-2 ring-background">
              <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
              <AvatarFallback className="text-2xl font-heading font-bold">
                {profile.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-heading font-bold truncate">
              {profile.displayName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('profile.memberSince', {
                date: new Date(profile.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                }),
              })}
            </p>
            {profile.profileUrl && (
              <a
                href={profile.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1.5 transition-colors"
              >
                {t('profile.steamProfile')}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </motion.div>

        {/* ── Stats strip ── */}
        <motion.div variants={stagger} className="grid grid-cols-3 gap-3">
          {[
            { value: formatStatValue(stats.games), label: t('profile.statsGames'), accent: 'var(--neon)', icon: Gamepad2 },
            { value: formatStatValue(stats.hours), label: t('profile.statsHours'), accent: 'var(--ember)', icon: Timer },
            { value: stats.platforms.toString(), label: t('profile.statsPlatforms'), accent: 'var(--primary)', icon: Link },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={scaleIn}
              className="profile-stat-tile rounded-xl p-3.5 text-center border-t-2"
              style={{ borderTopColor: stat.accent }}
            >
              <stat.icon className="w-4 h-4 mx-auto mb-1.5 text-muted-foreground" />
              <p className="font-heading text-xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Platforms ── */}
        <motion.section variants={fadeUp}>
          <h3 className="profile-section-line text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            <Gamepad2 className="w-4 h-4 shrink-0" />
            {t('profile.platforms')}
          </h3>
          <motion.div variants={stagger} className="space-y-2.5">
            {profile.platforms.map((platform) => (
              <motion.div
                key={platform.id}
                variants={fadeUp}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm border-l-[3px] transition-colors duration-300 hover:bg-card/80"
                style={{ borderLeftColor: PLATFORM_ACCENT[platform.id] || 'var(--border)' }}
              >
                <PlatformIcon
                  platformId={platform.id}
                  className="w-5 h-5 shrink-0 text-muted-foreground"
                  aria-label={platform.name}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{platform.name}</span>
                    {platform.connected && platform.needsRelink ? (
                      <Badge variant="destructive" className="text-[10px] gap-1 py-0 h-5">
                        <AlertTriangle className="w-3 h-3" />
                        {t('profile.needsRelink')}
                      </Badge>
                    ) : platform.connected ? (
                      <span className="flex items-center gap-1 text-[10px] text-success font-medium">
                        <Check className="w-3 h-3" />
                        {t('profile.connected')}
                      </span>
                    ) : platform.comingSoon ? (
                      <Badge variant="secondary" className="text-[10px] py-0 h-5">
                        {t('profile.comingSoon')}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {t('profile.notConnected')}
                      </span>
                    )}
                  </div>
                  {platform.connected && !platform.needsRelink && (
                    <div className="flex items-center gap-2.5 mt-1 text-xs text-muted-foreground">
                      {platform.syncable === false ? (
                        <span className="italic text-[11px]">{t('profile.noLibraryApi')}</span>
                      ) : (
                        <>
                          {platform.gameCount !== undefined && (
                            <span>{t('profile.gameCount', { count: platform.gameCount })}</span>
                          )}
                          {platform.totalPlaytimeMinutes != null && platform.totalPlaytimeMinutes > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Timer className="w-3 h-3" />
                              {formatPlaytime(platform.totalPlaytimeMinutes)}
                            </span>
                          )}
                          {platform.lastSyncedAt ? (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {t('profile.lastSync', {
                                date: new Date(platform.lastSyncedAt).toLocaleDateString('fr-FR', {
                                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                }),
                              })}
                            </span>
                          ) : (
                            <span>{t('profile.neverSynced')}</span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {/* Action buttons */}
                {platform.connected && platform.needsRelink && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnect(platform.id)}
                    className="shrink-0 h-8 text-xs"
                  >
                    <Link className="w-3.5 h-3.5 mr-1" />
                    {t('profile.reconnect')}
                  </Button>
                )}
                {platform.connected && !platform.needsRelink && platform.syncable !== false && (platform.id === 'steam' || platform.linkable) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(platform.id)}
                    disabled={syncingPlatform === platform.id}
                    className="shrink-0 h-8 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncingPlatform === platform.id ? 'animate-spin' : ''}`} />
                    {syncingPlatform === platform.id ? t('profile.syncing') : t('profile.syncNow')}
                  </Button>
                )}
                {platform.connected && !platform.needsRelink && platform.id !== 'steam' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnlink(platform.id)}
                    disabled={unlinking === platform.id}
                    className="shrink-0 h-8 text-xs text-destructive hover:text-destructive"
                  >
                    <Unlink className="w-3.5 h-3.5 mr-1" />
                    {t('profile.disconnect')}
                  </Button>
                )}
                {!platform.connected && !platform.comingSoon && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleConnect(platform.id)}
                    className="shrink-0 h-8 text-xs"
                  >
                    <Link className="w-3.5 h-3.5 mr-1" />
                    {t('profile.connect')}
                  </Button>
                )}
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ── Top Games Showcase ── */}
        {profile.topGames && profile.topGames.length > 0 && (
          <motion.section variants={fadeUp}>
            <h3 className="profile-section-line text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              <Trophy className="w-4 h-4 shrink-0" />
              {t('profile.topGames')}
            </h3>
            <motion.div variants={stagger} className="space-y-3">
              {/* Crown game: #1 */}
              {crownGame && (
                <motion.div variants={scaleIn} className="profile-game-crown rounded-xl overflow-hidden">
                  {crownGame.headerImageUrl && (
                    <div className="relative">
                      <img
                        src={crownGame.headerImageUrl}
                        alt={crownGame.gameName}
                        className="w-full aspect-[460/215] object-cover"
                        loading="lazy"
                      />
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-reward/90 text-reward-foreground rounded-lg px-2.5 py-1 text-xs font-bold backdrop-blur-sm shadow-lg">
                        <Trophy className="w-3.5 h-3.5" />
                        #1
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="font-heading font-semibold truncate">{crownGame.gameName}</span>
                    <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                      {formatPlaytime(crownGame.playtimeForever)}
                    </Badge>
                  </div>
                </motion.div>
              )}

              {/* Remaining games: 2-column grid */}
              {otherGames && otherGames.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5">
                  {otherGames.map((game, i) => (
                    <motion.div
                      key={game.steamAppId}
                      variants={scaleIn}
                      className="rounded-xl overflow-hidden border border-border/50 bg-card/40 backdrop-blur-sm transition-colors duration-300 hover:bg-card/70"
                    >
                      {game.headerImageUrl && (
                        <div className="relative">
                          <img
                            src={game.headerImageUrl}
                            alt={game.gameName}
                            className="w-full aspect-[460/215] object-cover"
                            loading="lazy"
                          />
                          <div className={`
                            absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center
                            text-[11px] font-bold backdrop-blur-sm
                            ${i === 0 ? 'bg-foreground/15 text-foreground/70' : i === 1 ? 'bg-ember/20 text-ember' : 'bg-muted/50 text-muted-foreground'}
                          `}>
                            {i + 2}
                          </div>
                        </div>
                      )}
                      <div className="px-3 py-2">
                        <p className="text-xs font-medium truncate">{game.gameName}</p>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {formatPlaytime(game.playtimeForever)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.section>
        )}
      </motion.main>
    </div>
  )
}
