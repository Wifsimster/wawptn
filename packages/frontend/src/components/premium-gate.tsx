import { Lock, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSubscriptionStore } from '@/stores/subscription.store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface PremiumGateProps {
  children: React.ReactNode
  feature?: string
  fallback?: React.ReactNode
}

export function PremiumGate({ children, feature, fallback }: PremiumGateProps) {
  const { tier, status } = useSubscriptionStore()
  const isPremium = tier === 'premium' && status === 'active'

  if (isPremium) return <>{children}</>
  if (fallback) return <>{fallback}</>

  return <PremiumGateFallback feature={feature} />
}

function PremiumGateFallback({ feature }: { feature?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center gap-3 py-6 px-4 rounded-lg border border-dashed border-border bg-muted/30">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Lock className="w-5 h-5" />
        <span className="text-sm font-medium">
          {feature || t('premium.featureLocked')}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={() => navigate('/subscription')}>
        <Crown className="w-4 h-4 mr-2 text-yellow-500" />
        {t('premium.unlock')}
      </Button>
    </div>
  )
}

export function PremiumLockIcon() {
  const { t } = useTranslation()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Lock className="w-3.5 h-3.5 text-muted-foreground inline ml-1" />
      </TooltipTrigger>
      <TooltipContent>{t('premium.featureLocked')}</TooltipContent>
    </Tooltip>
  )
}
