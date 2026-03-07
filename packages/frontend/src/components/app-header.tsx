import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gamepad2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AppHeaderProps {
  children?: React.ReactNode
  className?: string
  maxWidth?: 'narrow' | 'wide'
}

export function AppHeader({ children, className, maxWidth = 'narrow' }: AppHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className={cn('sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60', className)}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md">
        {t('app.skipToContent', 'Skip to content')}
      </a>
      <nav className={cn('mx-auto flex h-14 items-center px-[max(1rem,env(safe-area-inset-left))]', maxWidth === 'wide' ? 'max-w-6xl' : 'max-w-2xl')} style={{ paddingRight: 'max(1rem, env(safe-area-inset-right))' }} aria-label={t('app.name')}>
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
          <span className="ml-2 text-xs text-muted-foreground/60 leading-tight hidden sm:inline">
            v{__APP_VERSION__} — {new Date(__BUILD_TIME__).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={() => setShowLogoutDialog(true)} aria-label={t('groups.logout')}>
          <LogOut className="h-5 w-5" />
        </Button>
      </nav>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('groups.logoutConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('groups.logoutConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowLogoutDialog(false)}>
              {t('groups.logoutCancel')}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              {t('groups.logoutConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
