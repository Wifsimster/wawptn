import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Gamepad2, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function DiscordLinkPage() {
  const { t } = useTranslation()
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <X className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.invalidCode')}</h1>
        <p className="text-muted-foreground mb-6">{t('discordLink.noCode')}</p>
        <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
      </div>
    )
  }

  // Not logged in — prompt to log in
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Gamepad2 className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.title')}</h1>
        <p className="text-muted-foreground mb-6">{t('discordLink.loginPrompt')}</p>
        <Button variant="steam" size="lg" asChild>
          <a href={`/api/auth/steam/login?returnTo=${encodeURIComponent(`/discord/link?code=${code}`)}`}>{t('login.signIn')}</a>
        </Button>
      </div>
    )
  }

  // Linking in progress
  if (linking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{t('discordLink.linking')}</p>
      </div>
    )
  }

  // Success
  if (discordUsername) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Check className="w-12 h-12 text-green-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('discordLink.linked')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('discordLink.linkedDescription', { username: discordUsername })}
        </p>
        <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
      </div>
    )
  }

  // Error
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <X className="w-12 h-12 text-destructive mb-4" />
      <h1 className="text-2xl font-bold mb-2">{t('discordLink.failed')}</h1>
      <p className="text-muted-foreground mb-6">{error}</p>
      <Button onClick={() => navigate('/')}>{t('discordLink.goHome')}</Button>
    </div>
  )
}
