import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ExternalLink, Check, Clock, Gamepad2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

interface Platform {
  id: string
  name: string
  connected: boolean
  comingSoon?: boolean
  accountId?: string | null
  gameCount?: number
  lastSyncedAt?: string | null
  profileUrl?: string | null
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
}

const PLATFORM_ICONS: Record<string, string> = {
  steam: '🎮',
  battlenet: '⚔️',
  epic: '🏪',
  gog: '🌌',
  ubisoft: '🛡️',
}

export function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

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

  async function handleSync() {
    setSyncing(true)
    try {
      await api.syncProfile()
      toast.success(t('profile.syncSuccess'))
      // Reload profile after a short delay to get updated counts
      setTimeout(loadProfile, 3000)
    } catch {
      toast.error(t('profile.syncError'))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto p-4 space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="min-h-screen">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="max-w-2xl mx-auto p-4 space-y-6">
        <h2 className="text-2xl font-bold">{t('profile.title')}</h2>

        {/* User info card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
                <AvatarFallback className="text-lg">{profile.displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold truncate">{profile.displayName}</h3>
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
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    {t('profile.steamProfile')}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected platforms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5" />
              {t('profile.platforms')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.platforms.map((platform) => (
              <div
                key={platform.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <span className="text-2xl" role="img" aria-label={platform.name}>
                  {PLATFORM_ICONS[platform.id] || '🎮'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{platform.name}</span>
                    {platform.connected ? (
                      <Badge variant="default" className="text-xs gap-1">
                        <Check className="w-3 h-3" />
                        {t('profile.connected')}
                      </Badge>
                    ) : platform.comingSoon ? (
                      <Badge variant="secondary" className="text-xs">
                        {t('profile.comingSoon')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {t('profile.notConnected')}
                      </Badge>
                    )}
                  </div>
                  {platform.connected && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {platform.gameCount !== undefined && (
                        <span>{t('profile.gameCount', { count: platform.gameCount })}</span>
                      )}
                      {platform.lastSyncedAt ? (
                        <span className="flex items-center gap-1">
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
                    </div>
                  )}
                </div>
                {platform.connected && platform.id === 'steam' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing}
                    className="shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? t('profile.syncing') : t('profile.syncNow')}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
