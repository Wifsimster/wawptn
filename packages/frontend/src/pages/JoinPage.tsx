import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Gamepad2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export function JoinPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const joining = !!user && !!token && !error

  useEffect(() => {
    if (!user || !token) return
    let cancelled = false

    api.joinGroup(token).then(
      (result) => {
        if (cancelled) return
        toast.success(t('joinGroup.success'))
        navigate(`/groups/${result.id}`)
      },
      (err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t('joinGroup.error'))
      }
    )

    return () => { cancelled = true }
  }, [user, token, navigate, t])

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <Gamepad2 className="w-12 h-12 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t('join.invited')}</h1>
        <p className="text-muted-foreground mb-6">{t('join.loginPrompt')}</p>
        <Button variant="steam" size="lg" asChild>
          <a href="/api/auth/steam/login">{t('login.signIn')}</a>
        </Button>
      </div>
    )
  }

  if (joining) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{t('join.connecting')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold mb-2 text-destructive">{t('join.failed')}</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => navigate('/')}>{t('join.goToGroups')}</Button>
      </div>
    )
  }

  return null
}
