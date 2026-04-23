import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, GitCompare, Lock, RefreshCw, Trophy } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'
import { useProfileStore } from '@/stores/profile.store'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

function formatPlaytime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 1000) return `${hours}h`
  return `${(hours / 1000).toFixed(1)}kh`
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return 'jamais synchronisé'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Profile of another user, scoped to groups the viewer shares with
 * them. See issue #142. The page is intentionally simpler than the
 * self-profile: no linked platforms, no challenges, no toggles —
 * just the stats the other person has chosen to surface.
 */
export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: me } = useAuthStore()
  const { profiles, loading, errors, fetchProfile, refreshProfile } = useProfileStore()

  const profile = userId ? profiles[userId] : undefined
  useDocumentTitle(profile?.displayName ?? 'Profil')
  const isLoading = userId ? loading[userId] : false
  const error = userId ? errors[userId] : null

  useEffect(() => {
    if (userId) fetchProfile(userId)
  }, [userId, fetchProfile])

  // Redirect to the self-profile page if a user somehow navigates to
  // their own public profile URL. The self-profile page has the
  // linked-platforms and settings UI they actually want.
  useEffect(() => {
    if (me && userId && me.id === userId) {
      navigate('/profile', { replace: true })
    }
  }, [me, userId, navigate])

  if (isLoading && !profile) {
    return (
      <div className="min-h-dvh flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto w-full p-4 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </main>
        <AppFooter />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-dvh flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto w-full p-4 flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Profil indisponible</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Ce profil n'existe pas, ou vous n'avez pas de groupe en commun avec cet utilisateur.
            </p>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Retour
            </Button>
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  const commonCount = profile.commonGamesWithViewer.length
  const topCommon = profile.commonGamesWithViewer.slice(0, 3)

  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="max-w-2xl mx-auto w-full p-4 space-y-6 pb-12">
        {/* ── Header card ── */}
        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 flex flex-col items-center text-center">
          <Avatar className="w-24 h-24 ring-2 ring-background mb-4">
            <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.displayName} />
            <AvatarFallback className="text-3xl font-heading font-bold">
              {profile.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-heading font-bold">{profile.displayName}</h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Dernière synchro : {formatSyncedAt(profile.lastSyncedAt)}
          </p>

          {/* Stats row: the 3 numbers Marine picked at the meeting */}
          <div className="grid grid-cols-3 gap-6 w-full mt-6 pt-6 border-t border-border/40">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-heading font-bold tabular-nums">{commonCount}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Jeux en commun
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-heading font-bold tabular-nums">{profile.gameCount}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Bibliothèque
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-heading font-bold tabular-nums">
                {profile.visibilityFullLibrary
                  ? formatPlaytime(profile.totalPlaytimeMinutes)
                  : '🔒'}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Temps total
              </span>
            </div>
          </div>

          <div className="flex gap-2 mt-6 w-full">
            <Button
              className="flex-1"
              onClick={() => me && navigate(`/compare?a=${me.id}&b=${profile.id}`)}
              disabled={!me}
            >
              <GitCompare className="w-4 h-4 mr-2" />
              Comparer nos jeux
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => userId && refreshProfile(userId)}
              disabled={isLoading}
              aria-label="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* ── Common games with me ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Jeux en commun avec vous
          </h2>
          {commonCount === 0 ? (
            <p className="text-sm text-muted-foreground italic px-4 py-6 text-center border border-dashed border-border/50 rounded-xl">
              Aucun jeu en commun pour l'instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {topCommon.map((game) => (
                <li
                  key={game.steamAppId}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card/30"
                >
                  {game.headerImageUrl ? (
                    <img
                      src={game.headerImageUrl}
                      alt={game.gameName}
                      className="w-20 h-10 object-cover rounded-md shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-10 rounded-md bg-muted/40 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{game.gameName}</p>
                    {profile.visibilityLastPlayed ? (
                      <p className="text-[11px] text-muted-foreground">
                        {formatPlaytime(game.playtimeForever)} côté {profile.displayName}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        Temps de jeu masqué
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {commonCount > topCommon.length && (
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              … et {commonCount - topCommon.length} autres
            </p>
          )}
        </section>

        {/* ── Top games (opt-in only) ── */}
        {profile.visibilityFullLibrary && profile.topGames && profile.topGames.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Top jeux
            </h2>
            <ul className="space-y-2">
              {profile.topGames.slice(0, 10).map((game, i) => (
                <li
                  key={game.steamAppId}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card/30"
                >
                  <Badge variant="secondary" className="shrink-0 font-mono">
                    #{i + 1}
                  </Badge>
                  <span className="flex-1 truncate text-sm font-medium">{game.gameName}</span>
                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                    {formatPlaytime(game.playtimeForever)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Empty state when the user has opted out of full library ── */}
        {!profile.visibilityFullLibrary && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-border/50 bg-muted/10">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">{profile.displayName}</strong> n'a
              pas activé le partage de sa bibliothèque complète. Seuls les jeux en
              commun avec vous sont visibles.
            </div>
          </div>
        )}
      </main>
      <AppFooter />
    </div>
  )
}
