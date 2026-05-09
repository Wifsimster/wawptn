import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Crown, CreditCard, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSubscriptionStore, selectIsPremium } from '@/stores/subscription.store'
import { api } from '@/lib/api'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { track } from '@/lib/analytics'

export function SubscriptionPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('subscription.title'))
  const navigate = useNavigate()
  const { tier, currentPeriodEnd, cancelAtPeriodEnd, loading, fetchSubscription } = useSubscriptionStore()
  const isPremium = useSubscriptionStore(selectIsPremium)
  const [searchParams] = useSearchParams()
  const [actionLoading, setActionLoading] = useState(false)
  const [pollEnded, setPollEnded] = useState(false)

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  // The contextual gate banner: which feature/limit sent the user here.
  // Drives the lead-in copy (e.g. "You've hit the free group limit") and
  // the analytics attribution on the resulting checkout.
  const fromKey = searchParams.get('from')
  const wantsActivation = searchParams.get('success') === 'true'
  // Derived — true while we're still waiting for the webhook to flip
  // tier to premium. Avoids storing redundant state in the component and
  // keeps the synchronous-setState-in-effect lint happy.
  const activating = wantsActivation && !pollEnded && tier !== 'premium'

  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      toast.message(t('subscription.canceledFromCheckout'))
    }
  }, [searchParams, t])

  useEffect(() => {
    if (!wantsActivation) return

    // Stripe redirects to success_url synchronously, but the
    // checkout.session.completed webhook can land 1–5 s later. A single
    // fetch right after redirect would often see tier='free' and render
    // the upgrade CTA on the user we just charged. Poll briefly with
    // backoff until the store reports premium, then stop.
    let cancelled = false
    track('premium.checkout_completed')

    const delays = [400, 800, 1500, 2500, 4000, 6000]
    let attempt = 0
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const poll = async (): Promise<void> => {
      if (cancelled) return
      await fetchSubscription()
      if (cancelled) return
      const { tier: t2 } = useSubscriptionStore.getState()
      if (t2 === 'premium') {
        toast.success(t('subscription.activated'))
        setPollEnded(true)
        return
      }
      if (attempt >= delays.length) {
        // Webhook clearly hasn't landed; stop the spinner and show a soft
        // notice so the user can refresh manually. The reconciler will
        // self-heal within 24h, and a refresh after a few seconds will
        // usually pick up the change.
        toast.message(t('subscription.activationDelayed'))
        setPollEnded(true)
        return
      }
      const delay = delays[attempt] ?? 6000
      attempt += 1
      timeoutHandle = setTimeout(() => { void poll() }, delay)
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }, [wantsActivation, t, fetchSubscription])

  const handleCheckout = async () => {
    if (actionLoading) return
    setActionLoading(true)
    track('premium.checkout_started', { from: fromKey ?? 'subscription_page' })
    try {
      const { url } = await api.createCheckout()
      window.location.href = url
    } catch {
      toast.error(t('subscription.checkoutError'))
      setActionLoading(false)
    }
  }

  const handlePortal = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      const { url } = await api.createPortal()
      window.location.href = url
    } catch {
      toast.error(t('subscription.portalError'))
      setActionLoading(false)
    }
  }

  // isPremium is shared with PremiumGate via selectIsPremium so a user
  // who would see the upgrade gate elsewhere never sees the "Premium"
  // badge on this page (they used to diverge: the page treated
  // status='canceled' as premium, the gate did not).

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <AppHeader />
      <main id="main-content" className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="size-4 mr-2" />
          {t('group.back')}
        </Button>
        <h1 className="text-2xl font-heading font-bold mb-6">{t('subscription.title')}</h1>

        {!isPremium && fromKey && (
          <div
            className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
            role="status"
            aria-live="polite"
          >
            {t(`subscription.fromContext.${fromKey}`, t('subscription.fromContext.feature'))}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {isPremium ? (
                  <Crown className="size-5 text-reward" />
                ) : (
                  <CreditCard className="size-5 text-muted-foreground" />
                )}
                {t('subscription.currentPlan')}
              </CardTitle>
              <Badge variant={isPremium ? 'default' : 'secondary'}>
                {isPremium ? t('subscription.premium') : t('subscription.free')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activating ? (
              <p className="text-muted-foreground" role="status" aria-live="polite">
                {t('subscription.activating')}
              </p>
            ) : loading ? (
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
                {cancelAtPeriodEnd && (
                  <p className="text-sm text-reward">
                    {t('subscription.canceledNotice')}
                  </p>
                )}
                <Button variant="secondary" onClick={handlePortal} disabled={actionLoading}>
                  <ExternalLink className="size-4 mr-2" />
                  {t('subscription.manageButton')}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t('subscription.freeDescription')}
                </p>
                <ul className="space-y-2 text-sm">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <li key={n} className="flex items-center gap-2">
                      <Crown className="size-4 text-reward shrink-0" />
                      {t(`landing.premiumFeature${n}`)}
                    </li>
                  ))}
                </ul>
                <Button onClick={handleCheckout} disabled={actionLoading} className="mt-2">
                  <Crown className="size-4 mr-2" />
                  {t('subscription.upgradeButton')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <AppFooter />
    </div>
  )
}
