import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  installBeforeInstallPromptCapture,
  subscribeToInstallPrompt,
  promptInstall,
} from '@/lib/pwa'

const DISMISSED_KEY = 'pwa-install-dismissed-at'
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export function usePwaInstallPrompt() {
  const { t } = useTranslation()

  useEffect(() => {
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
