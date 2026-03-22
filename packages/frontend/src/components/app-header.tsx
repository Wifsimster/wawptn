import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User, Shield, Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useSubscriptionStore } from '@/stores/subscription.store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { PersonaBadge } from '@/components/persona-badge'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { WawptnLogo } from '@/components/icons/wawptn-logo'

interface AppHeaderProps {
  children?: React.ReactNode
  className?: string
  maxWidth?: 'narrow' | 'wide'
}

export function AppHeader({ children, className, maxWidth = 'narrow' }: AppHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { tier } = useSubscriptionStore()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className={cn('sticky top-0 z-50 w-full border-b border-white/[0.05] bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50', className)}>
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
          <WawptnLogo size={28} className="text-primary" />
          <span className="font-heading font-bold text-lg tracking-[-0.03em]">WAWPTN</span>
          <span className="ml-2 text-[10px] text-muted-foreground/30 font-mono hidden sm:inline">
            v{__APP_VERSION__} — {new Date(__BUILD_TIME__).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </button>
        <div className="flex-1" />

        {/* Today's bot persona */}
        {user && <PersonaBadge />}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center justify-center rounded-full hover:ring-2 hover:ring-primary/20 transition-all p-1.5 -m-1 min-h-[44px] min-w-[44px]"
            aria-label={t('profile.title')}
          >
            {user ? (
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.avatarUrl} alt={user.displayName} />
                <AvatarFallback>{user.displayName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
            )}
          </button>

          {showMenu && (
            <>
              {/* Backdrop to close menu */}
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-1 shadow-md">
                {user && (
                  <div className="px-2 py-1.5 text-sm font-medium truncate border-b border-border mb-1 pb-1.5">
                    {user.displayName}
                  </div>
                )}
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => { setShowMenu(false); navigate('/profile') }}
                >
                  <User className="w-4 h-4" />
                  {t('profile.title')}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => { setShowMenu(false); navigate('/subscription') }}
                >
                  <Crown className={cn('w-4 h-4', tier === 'premium' ? 'text-reward' : 'text-muted-foreground')} />
                  {tier === 'premium' ? t('subscription.premium') : t('subscription.upgrade')}
                </button>
                {user?.isAdmin && (
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => { setShowMenu(false); navigate('/admin') }}
                  >
                    <Shield className="w-4 h-4" />
                    Administration
                  </button>
                )}
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={() => { setShowMenu(false); setShowLogoutDialog(true) }}
                >
                  <LogOut className="w-4 h-4" />
                  {t('groups.logout')}
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      <ResponsiveDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('groups.logoutConfirmTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t('groups.logoutConfirmDescription')}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogFooter>
            <Button variant="secondary" onClick={() => setShowLogoutDialog(false)}>
              {t('groups.logoutCancel')}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              {t('groups.logoutConfirm')}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </header>
  )
}
