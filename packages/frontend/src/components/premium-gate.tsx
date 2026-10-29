import { useEffect } from 'react'
import { Lock, Crown, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSubscriptionStore, selectIsPremium } from '@/stores/subscription.store'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'

export type PremiumFromKey =
  | 'auto_vote'
  | 'recommendations'
  | 'group_limit'
  | 'member_limit'
  | 'history'
  | 'feature'

interface PremiumGateProps {
  children: React.ReactNode
  from?: PremiumFromKey
  feature?: string
  fallback?: React.ReactNode
}

export function PremiumGate({ children, from = 'feature', feature, fallback }: PremiumGateProps) {
  const isPremium = useSubscriptionStore(selectIsPremium)

  if (isPremium) return <>{children}</>
  if (fallback) return <>{fallback}</>

  return <PremiumGateFallback from={from} feature={feature} />
}

function PremiumGateFallback({ from, feature }: { from: PremiumFromKey; feature?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    track('premium.gate_shown', { from })
  }, [from])

  const handleUpgrade = () => {
    track('premium.upgrade_clicked', { from })
    navigate(`/subscription?from=${encodeURIComponent(from)}`)
  }

  const title = feature ?? t(`premium.gateTitle.${from}`, t('premium.featureLocked'))
  const description = t(`premium.gateDescription.${from}`, '')
  const benefits = t(`premium.gateBenefits.${from}`, { returnObjects: true, defaultValue: [] }) as string[]

  return (
    <div className="flex flex-col items-center gap-3 py-6 px-4 rounded-lg border border-dashed border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
      <div className="flex items-center gap-2 text-foreground">
        <Lock className="size-5 text-reward" />
        <span className="text-sm font-semibold">{title}</span>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          {description}
        </p>
      )}

      {benefits.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1 max-w-xs w-full">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <Check className="size-3.5 text-success shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <Button size="sm" onClick={handleUpgrade}>
        <Crown className="size-4 mr-1.5 text-reward" />
        {t('premium.unlock')}
      </Button>
    </div>
  )
}
