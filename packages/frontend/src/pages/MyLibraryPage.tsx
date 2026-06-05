import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Send, Gamepad2, MessageCircle, Hash, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { LibraryGame, PromoteTarget } from '@wawptn/types'
import { PageHeader } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { api, ApiError } from '@/lib/api'
import { resolveSteamHeaderImage } from '@/lib/steam-cdn'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

type SortOption = 'playtime' | 'name' | 'recent'

function formatPlaytime(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 1000) return `${hours}h`
  return `${(hours / 1000).toFixed(1)}kh`
}

/* ── Game card with a "promote to Discord" action ── */

function LibraryCard({
  game,
  onPromote,
}: {
  game: LibraryGame
  onPromote: (game: LibraryGame) => void
}) {
  const { t } = useTranslation()
  const playtime = formatPlaytime(game.playtimeForever)

  return (
    <li className="relative group rounded-lg overflow-hidden ring-1 ring-white/[0.06] hover:ring-primary/20 transition-all duration-300 list-none">
      <img
        src={resolveSteamHeaderImage(game.steamAppId, game.headerImageUrl)}
        alt={game.gameName}
        width={460}
        height={215}
        className="w-full aspect-[460/215] object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end p-2.5">
        <span className="text-xs font-semibold text-white leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] pr-2">
          {game.gameName}
        </span>
      </div>
      {game.metacriticScore !== null && (
        <span
          className={cn(
            'absolute top-1 left-1 text-xs font-bold px-1.5 py-0.5 rounded text-background',
            game.metacriticScore >= 75 ? 'bg-score-good' : game.metacriticScore >= 50 ? 'bg-score-mixed' : 'bg-score-bad',
          )}
        >
          {game.metacriticScore}
        </span>
      )}
      {playtime && (
        <span className="absolute top-1 right-1 text-xs bg-black/70 text-white px-1.5 py-0.5 rounded font-mono">
          {playtime}
        </span>
      )}
      <button
        type="button"
        onClick={() => onPromote(game)}
        className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-primary/90 hover:bg-primary text-primary-foreground text-[11px] font-medium px-2.5 py-1 backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        aria-label={t('library.promoteAria', { game: game.gameName })}
      >
        <Send className="size-3" />
        {t('library.promote')}
      </button>
    </li>
  )
}

/* ── Promote-to-Discord dialog ── */

function PromoteDialog({
  game,
  open,
  onOpenChange,
}: {
  game: LibraryGame | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [targets, setTargets] = useState<PromoteTarget[] | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // Load the user's Discord-enabled groups when the dialog opens.
  useEffect(() => {
    if (!open) return
    setTargets(null)
    setSelectedGroupId(null)
    setMessage('')
    api
      .getPromoteTargets()
      .then((res) => {
        setTargets(res.groups)
        if (res.groups.length === 1) setSelectedGroupId(res.groups[0]!.groupId)
      })
      .catch(() => setTargets([]))
  }, [open])

  const handlePromote = async () => {
    if (!game || !selectedGroupId) return
    setSending(true)
    try {
      await api.promoteGame(game.steamAppId, selectedGroupId, message.trim() || undefined)
      toast.success(t('library.promoteSuccess'))
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('library.promoteError')
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('library.promoteTitle')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {game ? t('library.promoteDescription', { game: game.gameName }) : ''}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4 px-4 sm:px-0">
          {/* Group picker */}
          {targets === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : targets.length === 0 ? (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border/50 bg-card/50 text-sm text-muted-foreground">
              <MessageCircle className="size-5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{t('library.noTargets')}</p>
            </div>
          ) : (
            <div className="space-y-2" role="radiogroup" aria-label={t('library.chooseGroup')}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t('library.chooseGroup')}
              </p>
              {targets.map((target) => {
                const selected = selectedGroupId === target.groupId
                return (
                  <button
                    key={target.groupId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedGroupId(target.groupId)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 bg-card/50 hover:bg-card/80',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{target.groupName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                        {target.hasChannel ? <Hash className="size-3 shrink-0" /> : <MessageCircle className="size-3 shrink-0" />}
                        {target.discordChannelName
                          ? `${target.discordChannelName}${target.discordGuildName ? ` · ${target.discordGuildName}` : ''}`
                          : t('library.discordWebhook')}
                      </p>
                    </div>
                    {selected && <Check className="size-4 text-primary shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Optional message */}
          {targets && targets.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="promote-message" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t('library.messageLabel')}
              </label>
              <Textarea
                id="promote-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                placeholder={t('library.messagePlaceholder')}
                rows={3}
              />
            </div>
          )}
        </div>

        <ResponsiveDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handlePromote} disabled={sending || !selectedGroupId}>
            <Send className="size-4 mr-1.5" />
            {sending ? t('library.promoting') : t('library.promoteConfirm')}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

/* ── Page ── */

export function MyLibraryPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('library.title'))
  const navigate = useNavigate()

  const [games, setGames] = useState<LibraryGame[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('playtime')
  const [promoteGame, setPromoteGame] = useState<LibraryGame | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const loadLibrary = useCallback(async () => {
    try {
      const data = await api.getLibrary({ sort: 'playtime' })
      setGames(data.games)
      setTotal(data.total)
    } catch {
      toast.error(t('library.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // Search + sort happen client-side over the already-loaded library — snappy
  // and avoids a network round-trip per keystroke.
  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? games.filter((g) => g.gameName.toLowerCase().includes(q)) : games.slice()
    if (sort === 'name') {
      filtered.sort((a, b) => a.gameName.localeCompare(b.gameName))
    } else if (sort === 'recent') {
      filtered.sort((a, b) => (b.playtime2weeks ?? 0) - (a.playtime2weeks ?? 0) || (b.playtimeForever ?? 0) - (a.playtimeForever ?? 0))
    } else {
      filtered.sort((a, b) => (b.playtimeForever ?? 0) - (a.playtimeForever ?? 0))
    }
    return filtered
  }, [games, query, sort])

  const openPromote = useCallback((game: LibraryGame) => {
    setPromoteGame(game)
    setDialogOpen(true)
  }, [])

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'playtime', label: t('library.sortPlaytime') },
    { value: 'recent', label: t('library.sortRecent') },
    { value: 'name', label: t('library.sortName') },
  ]

  return (
    <>
      <PageHeader>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-heading font-semibold text-lg ml-1">{t('library.title')}</h1>
      </PageHeader>

      <main id="main-content" className="max-w-6xl mx-auto w-full p-4 space-y-4 pb-12">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="pl-9"
              aria-label={t('library.searchPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={t('library.sortLabel')}>
            {sortOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={sort === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSort(opt.value)}
                className="text-xs h-9"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Count */}
        {!loading && (
          <p className="text-xs text-muted-foreground">
            {query.trim()
              ? t('library.countFiltered', { shown: displayed.length, total })
              : t('library.count', { count: total })}
          </p>
        )}

        {/* Grid */}
        {loading ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 m-0 p-0 list-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <li key={i} className="list-none">
                <Skeleton className="w-full aspect-[460/215] rounded-lg" />
              </li>
            ))}
          </ul>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-20 text-muted-foreground">
            <Gamepad2 className="size-10 opacity-40" />
            <p className="text-sm max-w-sm">
              {total === 0 ? t('library.emptyLibrary') : t('library.emptySearch')}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 m-0 p-0 list-none">
            {displayed.map((game) => (
              <LibraryCard key={game.steamAppId} game={game} onPromote={openPromote} />
            ))}
          </ul>
        )}
      </main>

      <PromoteDialog game={promoteGame} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
