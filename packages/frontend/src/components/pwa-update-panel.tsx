import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Surfaces a fixed bottom panel when vite-plugin-pwa detects that a fresh
 * service worker is waiting. The user can refresh on demand (calls
 * `updateServiceWorker(true)`, which `skipWaiting`s the new SW and reloads
 * the page) or dismiss the panel and keep working — the new SW stays in
 * waiting state and the panel re-surfaces if a subsequent deploy fires
 * `onNeedRefresh` again.
 *
 * Wrapped in AnimatePresence/motion so it slides in without jolting the
 * layout (the panel sits in a fixed overlay above the routes).
 */
export function PwaUpdatePanel() {
  const { t } = useTranslation()

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Belt-and-braces hourly check: vite-plugin-pwa calls `update()` on
      // load, but a long-lived PWA tab (mobile, screen never locked) would
      // otherwise miss deploys until a manual reload. 1h is gentle enough
      // not to hammer the SW cache.
      if (!registration) return
      setInterval(() => {
        void registration.update()
      }, 60 * 60 * 1000)
    },
  })

  const dismiss = () => {
    setNeedRefresh(false)
  }

  const refresh = () => {
    void updateServiceWorker(true)
  }

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 pointer-events-none"
        >
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-card/95 p-4 shadow-[0_10px_40px_oklch(0_0_0_/_0.5)] backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <RefreshCw className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-card-foreground">
                  {t('pwa.updateAvailableTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('pwa.updateAvailableDescription')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={refresh}>
                    {t('pwa.updateAction')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismiss}>
                    {t('pwa.updateLater')}
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t('pwa.updateDismissLabel')}
                className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
