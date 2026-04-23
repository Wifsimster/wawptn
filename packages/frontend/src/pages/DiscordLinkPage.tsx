import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Gamepad2, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function DiscordLinkPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('discordLink.title'))
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const code = searchParams.get('code')
  const [error, setError] = useState<string | null>(null)
  const [discordUsername, setDiscordUsername] = useState<string | null>(null)
  const linking = !!user && !!code && !error && !discordUsername

  useEffect(() => {
    if (!user || !code) return
    let cancelled = false

    api.confirmDiscordLink(code).then(
      (result) => {
        if (cancelled) return
        setDiscordUsername(result.discordUsername)
        toast.success(t('discordLink.success', { username: result.discordUsername }))
      },
      (err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('discordLink.error'))
      }
    )

    return () => { cancelled = true }
  }, [user, code, t])

  // No code in URL
  if (!code) {
    return (
      <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center px-4">
        <X className="w-12 h-12 text-destructive mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.invalidCode')}</h1>
        <p className="text-muted-foreground mb-6">{t('discordLink.noCode')}</p>
        <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
      </main>
    )
  }

  // Not logged in — prompt to log in
  if (!user) {
    return (
      <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center px-4">
        <Gamepad2 className="w-12 h-12 text-primary mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.title')}</h1>
        <p className="text-muted-foreground mb-6">{t('discordLink.loginPrompt')}</p>
        <Button variant="steam" size="lg" asChild>
          <a href={`/api/auth/steam/login?returnTo=${encodeURIComponent(`/discord/link?code=${code}`)}`}>{t('login.signIn')}</a>
        </Button>
      </main>
    )
  }

  // Linking in progress
  if (linking) {
    return (
      <main
        id="main-content"
        className="min-h-dvh flex flex-col items-center justify-center"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" aria-hidden="true" />
        <p className="text-muted-foreground">{t('discordLink.linking')}</p>
      </main>
    )
  }

  // Success
  if (discordUsername) {
    return (
      <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center px-4">
        <Check className="w-12 h-12 text-success mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.linked')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('discordLink.linkedDescription', { username: discordUsername })}
        </p>
        <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
      </main>
    )
  }

  // Error
  return (
    <main id="main-content" className="min-h-dvh flex flex-col items-center justify-center px-4" role="alert">
      <X className="w-12 h-12 text-destructive mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold mb-2">{t('discordLink.failed')}</h1>
      <p className="text-muted-foreground mb-6">{error}</p>
      <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
    </main>
  )
}
