import { Gamepad2 } from 'lucide-react'
import { FaSteam } from 'react-icons/fa'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Gamepad2 className="w-12 h-12 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">WAWPTN</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-md">
          {t('app.tagline')}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          {t('login.subtitle')}
        </p>
      </div>

      <Button variant="steam" size="lg" asChild>
        <a href="/api/auth/steam/login" className="gap-3">
          <FaSteam className="w-6 h-6" />
          {t('login.signIn')}
        </a>
      </Button>

      <p className="mt-6 text-xs text-muted-foreground">
        {t('login.privacy')}
      </p>
    </div>
  )
}
