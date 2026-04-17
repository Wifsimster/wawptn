import { useEffect, useState } from 'react'
import { KoeWidget } from '@wifsimster/koe'
import '@wifsimster/koe/style.css'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

const PROJECT_KEY = (import.meta.env.VITE_KOE_PROJECT_KEY as string | undefined) ?? 'wawptn'
const API_URL = (import.meta.env.VITE_KOE_API_URL as string | undefined) ?? 'https://koe.battistella.ovh'

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

  // Gate on identity.userId matching so a stale hash from a previous
  // session never leaks into the next user's widget.
  if (!PROJECT_KEY || !API_URL || !user || identity?.userId !== user.id) return null

  return (
    <KoeWidget
      projectKey={PROJECT_KEY}
      apiUrl={API_URL}
      user={{
        id: user.id,
        name: user.displayName,
        avatarUrl: user.avatarUrl,
        metadata: { steamId: user.steamId },
      }}
      userHash={identity.userHash}
      position="bottom-right"
      locale={{
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
      }}
    />
  )
}
