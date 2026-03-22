import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Crown, CreditCard, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSubscriptionStore } from '@/stores/subscription.store'
import { api } from '@/lib/api'

export function SubscriptionPage() {
  const { t } = useTranslation()
  const { tier, status, currentPeriodEnd, loading, fetchSubscription } = useSubscriptionStore()
  const [searchParams] = useSearchParams()
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success(t('subscription.activated'))
      fetchSubscription()
    }
  }, [searchParams, t, fetchSubscription])

  const handleCheckout = async () => {
    setActionLoading(true)
    try {
      const { url } = await api.createCheckout()
      window.location.href = url
    } catch {
      toast.error(t('subscription.checkoutError'))
      setActionLoading(false)
    }
  }

  const handlePortal = async () => {
    setActionLoading(true)
    try {
      const { url } = await api.createPortal()
      window.location.href = url
    } catch {
      toast.error(t('subscription.portalError'))
      setActionLoading(false)
    }
  }

  const isPremium = tier === 'premium' && (status === 'active' || status === 'canceled')

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-heading font-bold mb-6">{t('subscription.title')}</h1>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {isPremium ? (
                  <Crown className="w-5 h-5 text-reward" />
                ) : (
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                )}
                {t('subscription.currentPlan')}
              </CardTitle>
              <Badge variant={isPremium ? 'default' : 'secondary'}>
                {isPremium ? t('subscription.premium') : t('subscription.free')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground">{t('subscription.loading')}</p>
            ) : isPremium ? (
              <>
                <p className="text-muted-foreground">
                  {t('subscription.premiumDescription')}
                </p>
                {currentPeriodEnd && (
                  <p className="text-sm text-muted-foreground">
                    {t('subscription.renewsAt', {
                      date: new Date(currentPeriodEnd).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'long', year: 'numeric',
                      }),
                    })}
                  </p>
                )}
                {status === 'canceled' && (
                  <p className="text-sm text-reward">
                    {t('subscription.canceledNotice')}
                  </p>
                )}
                <Button variant="secondary" onClick={handlePortal} disabled={actionLoading}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t('subscription.manageButton')}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t('subscription.freeDescription')}
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-reward" />
                    {t('landing.premiumFeature1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-reward" />
                    {t('landing.premiumFeature2')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-reward" />
                    {t('landing.premiumFeature3')}
                  </li>
                </ul>
                <Button onClick={handleCheckout} disabled={actionLoading} className="mt-2">
                  <Crown className="w-4 h-4 mr-2" />
                  {t('subscription.upgradeButton')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
