import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Gamepad2, Trophy } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatDiffChip } from '@/components/stat-diff-chip'
import { PlaytimeBar } from '@/components/playtime-bar'
import { useAuthStore } from '@/stores/auth.store'
import { useProfileStore } from '@/stores/profile.store'

function toHours(minutes: number | null): number {
  if (!minutes || minutes <= 0) return 0
  return Math.round(minutes / 60)
}

function compareKey(a: string, b: string): string {
  return [a, b].sort().join('::')
}

/**
 * Side-by-side comparison of two users' libraries.
 *
 * The URL shape is `/compare?a=<userId>&b=<userId>`, both UUIDs.
 * Defaults `a` to the current viewer if omitted so the canonical
 * "compare with me" button only needs to pass `b`.
 */
export function ComparePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user: me } = useAuthStore()
  const { compares, loading, errors, fetchCompare } = useProfileStore()

  const aParam = params.get('a')
  const bParam = params.get('b')
  const a = aParam ?? me?.id ?? ''
  const b = bParam ?? ''
  const key = a && b ? compareKey(a, b) : ''

  const result = key ? compares[key] : undefined
  const isLoading = key ? loading[key] : false
  const error = key ? errors[key] : null

  useEffect(() => {
    if (a && b && a !== b) fetchCompare(a, b)
  }, [a, b, fetchCompare])

  // Identify which side is "me" so labels read naturally.
  const meIsA = me?.id === a
  const meIsB = me?.id === b

  const sortedCommon = useMemo(() => {
    if (!result) return []
    return [...result.commonGames].sort((x, y) => {
      const xx = (x.playtimeA ?? 0) + (x.playtimeB ?? 0)
      const yy = (y.playtimeA ?? 0) + (y.playtimeB ?? 0)
      return yy - xx
    })
  }, [result])

  if (!a || !b || a === b) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto w-full p-4 flex-1 flex items-center justify-center text-center">
          <div>
            <h2 className="text-lg font-semibold">Comparaison impossible</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Il faut deux utilisateurs différents pour lancer une comparaison.
            </p>
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  if (isLoading && !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-3xl mx-auto w-full p-4 space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-6 w-32" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </main>
        <AppFooter />
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </AppHeader>
        <main id="main-content" className="max-w-2xl mx-auto w-full p-4 flex-1 flex items-center justify-center text-center">
          <div>
            <h2 className="text-lg font-semibold">Comparaison indisponible</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Vous devez partager un groupe avec ces deux utilisateurs pour les comparer.
            </p>
            <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">
              Retour
            </Button>
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  const commonCount = result.commonGames.length
  const overlapPct = Math.round(result.overlapRatio * 100)
  const nameA = meIsA ? 'Vous' : result.a.displayName
  const nameB = meIsB ? 'Vous' : result.b.displayName

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </AppHeader>

      <main id="main-content" className="max-w-3xl mx-auto w-full p-4 space-y-6 pb-12">
        {/* ── VS header ── */}
        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <UserBadge
              name={nameA}
              avatarUrl={result.a.avatarUrl}
              gameCount={result.a.gameCount}
              align="right"
            />
            <div className="flex flex-col items-center shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Comparaison
              </span>
              <span className="text-2xl font-heading font-black text-primary">VS</span>
            </div>
            <UserBadge
              name={nameB}
              avatarUrl={result.b.avatarUrl}
              gameCount={result.b.gameCount}
              align="left"
            />
          </div>

          {/* Overlap callout — the emotional hook */}
          <div className="mt-6 pt-6 border-t border-border/40 text-center">
            <div className="text-3xl font-heading font-bold text-primary tabular-nums">
              {commonCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              jeux en commun · {overlapPct}% de recouvrement
            </div>
          </div>
        </div>

        {/* ── Common games with playtime bars ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Les plus joués en commun
          </h2>
          {commonCount === 0 ? (
            <p className="text-sm text-muted-foreground italic px-4 py-8 text-center border border-dashed border-border/50 rounded-xl">
              Aucun jeu en commun. Pas cool.
            </p>
          ) : (
            <ul className="space-y-2">
              {sortedCommon.slice(0, 20).map((game) => {
                const hoursA = toHours(game.playtimeA)
                const hoursB = toHours(game.playtimeB)
                const diff = hoursA - hoursB
                return (
                  <li
                    key={game.steamAppId}
                    className="p-3 rounded-xl border border-border/50 bg-card/30 space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      {game.headerImageUrl ? (
                        <img
                          src={game.headerImageUrl}
                          alt={game.gameName}
                          className="w-16 h-8 object-cover rounded-md shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-16 h-8 rounded-md bg-muted/40 shrink-0" />
                      )}
                      <span className="flex-1 text-sm font-medium truncate">{game.gameName}</span>
                      <StatDiffChip value={diff} unit="h" neutralLabel="égaux" />
                    </div>
                    <PlaytimeBar playtimeA={game.playtimeA} playtimeB={game.playtimeB} />
                    <div className="flex justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
                      <span>{nameA} · {hoursA}h</span>
                      <span>{nameB} · {hoursB}h</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {commonCount > 20 && (
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              … et {commonCount - 20} autres
            </p>
          )}
        </section>

        {/* ── Only-A / Only-B ── */}
        {(result.onlyAGames.length > 0 || result.onlyBGames.length > 0) && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Gamepad2 className="w-4 h-4" />
              Bibliothèques personnelles
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <OnlyList label={`Uniquement chez ${nameA}`} games={result.onlyAGames.slice(0, 8)} />
              <OnlyList label={`Uniquement chez ${nameB}`} games={result.onlyBGames.slice(0, 8)} />
            </div>
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  )
}

interface UserBadgeProps {
  name: string
  avatarUrl: string | null
  gameCount: number
  align: 'left' | 'right'
}

function UserBadge({ name, avatarUrl, gameCount, align }: UserBadgeProps) {
  return (
    <div className={`flex-1 flex flex-col items-center min-w-0 ${align === 'left' ? 'order-1' : ''}`}>
      <Avatar className="w-20 h-20 ring-2 ring-background mb-2">
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback className="text-2xl font-heading font-bold">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-heading font-semibold text-sm truncate max-w-full">{name}</span>
      <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
        {gameCount} jeux
      </span>
    </div>
  )
}

interface OnlyListProps {
  label: string
  games: Array<{ steamAppId: number; gameName: string; playtimeForever: number | null }>
}

function OnlyList({ label, games }: OnlyListProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {label}
      </h3>
      {games.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Rien à afficher.</p>
      ) : (
        <ul className="space-y-1">
          {games.map((g) => (
            <li key={g.steamAppId} className="flex justify-between text-xs gap-2">
              <span className="truncate">{g.gameName}</span>
              <span className="text-muted-foreground font-mono shrink-0 tabular-nums">
                {g.playtimeForever ? `${Math.round(g.playtimeForever / 60)}h` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
