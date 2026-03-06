import { useNavigate } from 'react-router-dom'
import { Gamepad2, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  children?: React.ReactNode
  className?: string
}

export function AppHeader({ children, className }: AppHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className={cn('border-b border-border p-4', className)}>
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          {children}
          <Gamepad2 className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">WAWPTN</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('groups.logout')}>
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}
