import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  installBeforeInstallPromptCapture,
  subscribeToInstallPrompt,
  promptInstall,
} from '@/lib/pwa'

const DISMISSED_KEY = 'pwa-install-dismissed-at'
// Re-ask at most once per 7 days after a dismissal — we don't want to
// badger the user, but we shouldn't disappear forever on a single "Not now".
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Captures the browser's `beforeinstallprompt` event and, when it fires,
 * shows a non-blocking sonner toast inviting the user to install the PWA.
 * The toast has an explicit "Installer" action that triggers the native
 * install flow. Dismissals are remembered in localStorage and a 7-day
 * cooldown applies before we'll try again.
 *
 * Must be mounted once at the app level. Safe to call in contexts where
 * the PWA isn't installable (mobile Safari, already-installed PWAs) —
 * the browser simply never fires `beforeinstallprompt` and nothing shows.
 */
export function usePwaInstallPrompt() {
  const { t } = useTranslation()

  useEffect(() => {
    // Register the DOM listener once per app session. Idempotent.
    installBeforeInstallPromptCapture()

    const unsubscribe = subscribeToInstallPrompt((event) => {
      if (!event) return

      const dismissedAtRaw = localStorage.getItem(DISMISSED_KEY)
      if (dismissedAtRaw) {
        const dismissedAt = Number.parseInt(dismissedAtRaw, 10)
        if (!Number.isNaN(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS) {
          return
        }
      }

      toast(t('pwa.installPromptTitle'), {
        description: t('pwa.installPromptDescription'),
        duration: 12000,
        action: {
          label: t('pwa.installAction'),
          onClick: () => {
            void promptInstall().then((outcome) => {
              if (outcome !== 'accepted') {
                localStorage.setItem(DISMISSED_KEY, String(Date.now()))
              }
            })
          },
        },
        onDismiss: () => {
          localStorage.setItem(DISMISSED_KEY, String(Date.now()))
        },
      })
    })

    return () => {
      unsubscribe()
    }
  }, [t])
}
