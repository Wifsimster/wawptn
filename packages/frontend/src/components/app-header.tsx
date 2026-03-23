import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User, Shield, Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { useSubscriptionStore } from '@/stores/subscription.store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { NotificationBell } from '@/components/notification-bell'

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

  const handleLogout = async () => {
    await logout()
    navigate('/')
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

        {/* Notifications */}
        {user && <NotificationBell />}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
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
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {user && (
              <>
                <DropdownMenuLabel className="truncate">
                  {user.displayName}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              <User />
              {t('profile.title')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/subscription')}>
              <Crown className={cn(tier === 'premium' ? 'text-reward' : 'text-muted-foreground')} />
              {tier === 'premium' ? t('subscription.premium') : t('subscription.upgrade')}
            </DropdownMenuItem>
            {user?.isAdmin && (
              <DropdownMenuItem onSelect={() => navigate('/admin')}>
                <Shield />
                Administration
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setShowLogoutDialog(true)}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut />
              {t('groups.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
