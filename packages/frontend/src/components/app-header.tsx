import { useNavigate } from 'react-router-dom'
import { Gamepad2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  children?: React.ReactNode
  className?: string
  maxWidth?: 'narrow' | 'wide'
}

export function AppHeader({ children, className, maxWidth = 'narrow' }: AppHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className={cn('sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md">
        {t('app.skipToContent', 'Skip to content')}
      </a>
      <nav className={cn('mx-auto flex h-14 items-center px-4', maxWidth === 'wide' ? 'max-w-6xl' : 'max-w-2xl')} aria-label={t('app.name')}>
        {children && (
          <div className="mr-2 flex items-center">
            {children}
          </div>
        )}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label={t('app.name') + ' — ' + t('app.tagline')}
        >
          <Gamepad2 className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg tracking-tight">WAWPTN</span>
        </button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('groups.logout')}>
          <LogOut className="h-5 w-5" />
        </Button>
      </nav>
    </header>
  )
}
