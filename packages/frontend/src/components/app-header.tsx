import { Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  children?: React.ReactNode
  className?: string
}

export function AppHeader({ children, className }: AppHeaderProps) {
  return (
    <header className={cn('border-b border-border p-4', className)}>
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">WAWPTN</span>
        </div>
        {children}
      </div>
    </header>
  )
}
