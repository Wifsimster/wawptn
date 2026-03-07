import { Gamepad2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function LoginPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
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
          <svg className="w-6 h-6" viewBox="0 0 256 259" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M127.779 0C60.21 0 5.2 52.063.553 117.735l68.39 28.273c5.801-3.964 12.8-6.288 20.358-6.288.672 0 1.34.023 2.004.06l30.469-44.148v-.62c0-26.392 21.476-47.868 47.868-47.868 26.393 0 47.869 21.476 47.869 47.869 0 26.392-21.476 47.868-47.869 47.868h-1.108l-43.44 31.026c0 .524.032 1.049.032 1.578 0 19.803-16.096 35.898-35.898 35.898-17.463 0-32.058-12.535-35.263-29.116L3.27 155.962C20.038 213.357 69.68 258.557 127.779 258.557c71.472 0 129.377-57.905 129.377-129.278C257.156 57.905 199.251 0 127.779 0" /></svg>
          {t('login.signIn')}
        </a>
      </Button>

      <p className="mt-6 text-xs text-muted-foreground">
        {t('login.privacy')}
      </p>
    </div>
  )
}
