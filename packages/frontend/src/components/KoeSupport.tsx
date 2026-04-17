import { useEffect, useState } from 'react'
import koeScriptUrl from '@wifsimster/koe/standalone?url'
import koeStyleUrl from '@wifsimster/koe/style.css?url'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

const PROJECT_KEY = (import.meta.env.VITE_KOE_PROJECT_KEY as string | undefined) ?? 'wawptn'
const API_URL = (import.meta.env.VITE_KOE_API_URL as string | undefined) ?? 'https://koe.battistella.ovh'

// The Koe library build bundles `react-dom/client` internals, which
// collides with the host's React at runtime (error #527). We therefore
// load the standalone IIFE instead — it ships its own isolated React in
// a separate root, so the two never share a fiber tree.
type KoeInitConfig = {
  projectKey: string
  apiUrl: string
  user: {
    id: string
    name?: string
    avatarUrl?: string
    metadata?: Record<string, string | number | boolean | null>
  }
  userHash?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  locale?: Record<string, unknown>
}
declare global {
  interface Window {
    Koe?: {
      init: (config: KoeInitConfig) => void
      destroy: () => void
    }
  }
}

let loadPromise: Promise<void> | null = null
function ensureKoeLoaded(): Promise<void> {
  if (window.Koe) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-koe-style]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = koeStyleUrl
      link.setAttribute('data-koe-style', '')
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = koeScriptUrl
    script.async = true
    script.onload = () => (window.Koe ? resolve() : reject(new Error('Koe global missing after load')))
    script.onerror = () => reject(new Error('Failed to load Koe standalone bundle'))
    document.head.appendChild(script)
  })
  return loadPromise
}

const FR_LOCALE = {
  launcherLabel: 'Support',
  title: 'Aide & retours',
  subtitle: 'Signalez un bug ou proposez une évolution',
  picker: {
    prompt: 'Que souhaitez-vous faire ?',
    bug: 'Signaler un bug',
    bugHint: 'Quelque chose ne fonctionne pas comme prévu',
    feature: 'Proposer une évolution',
    featureHint: 'Suggérez une nouvelle fonctionnalité',
  },
  back: 'Retour',
  tabs: { bug: 'Bug', feature: 'Évolution', chat: 'Chat' },
  bugForm: {
    title: 'Titre',
    description: 'Description',
    steps: 'Étapes pour reproduire',
    expected: 'Comportement attendu',
    actual: 'Comportement observé',
    submit: 'Envoyer',
    success: 'Merci, votre signalement a bien été reçu.',
  },
  featureForm: {
    title: 'Titre',
    description: 'Description',
    submit: 'Envoyer',
    success: 'Merci, votre proposition a bien été reçue.',
  },
  chat: { placeholder: 'Écrivez votre message…', empty: 'Aucun message.', send: 'Envoyer' },
}

export function KoeSupport() {
  const user = useAuthStore((s) => s.user)
  const [identity, setIdentity] = useState<{ userId: string; userHash: string } | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.getKoeIdentity()
      .then(({ userHash }) => { if (!cancelled) setIdentity({ userId: user.id, userHash }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!PROJECT_KEY || !API_URL || !user || identity?.userId !== user.id) return
    let cancelled = false
    ensureKoeLoaded()
      .then(() => {
        if (cancelled || !window.Koe) return
        window.Koe.init({
          projectKey: PROJECT_KEY,
          apiUrl: API_URL,
          user: {
            id: user.id,
            name: user.displayName,
            avatarUrl: user.avatarUrl,
            metadata: { steamId: user.steamId },
          },
          userHash: identity.userHash,
          position: 'bottom-right',
          locale: FR_LOCALE,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      window.Koe?.destroy()
    }
  }, [user, identity])

  return null
}
