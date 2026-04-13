import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import { useChallengeStore } from '@/stores/challenge.store'

/**
 * Global hook that listens for challenge:unlocked socket events
 * and shows a celebratory toast. Refreshes challenge store on unlock.
 * Must be mounted once at the app level after authentication.
 *
 * Migrated to useSocketEvent in the Yuki #1 refactor so the
 * subscribe / unsubscribe lifecycle is handled by the hook instead of
 * this module's own useEffect. The handler is memoised via useCallback
 * so a stable dep list avoids churn.
 */
export function useChallengeListener() {
  const { t } = useTranslation()
  const fetchChallenges = useChallengeStore((s) => s.fetchChallenges)

  const handleUnlocked = useCallback(
    (data: { userId: string; challengeId: string; title: string; icon: string; tier: number }) => {
      toast.success(t('challenges.unlockedToast', { icon: data.icon, title: data.title }), {
        duration: 6000,
      })
      fetchChallenges()
    },
    [t, fetchChallenges],
  )

  useSocketEvent('challenge:unlocked', handleUnlocked, [handleUnlocked])
}
