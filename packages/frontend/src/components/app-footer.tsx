import { WawptnLogo } from '@/components/icons/wawptn-logo'
import { useTranslation } from 'react-i18next'

export function AppFooter() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-white/[0.04] px-4 py-6 mt-auto">
      <div className="max-w-5xl mx-auto flex items-center justify-center gap-2.5 text-xs text-muted-foreground/50">
        <WawptnLogo size={16} className="text-muted-foreground/50" />
        <span>
          WAWPTN — {t('app.tagline')} — v{__APP_VERSION__} — {new Date(__BUILD_TIME__).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </footer>
  )
}
