import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getSocket } from '@/lib/socket'
import { useChallengeStore } from '@/stores/challenge.store'

/**
 * Global hook that listens for challenge:unlocked socket events
 * and shows a celebratory toast. Refreshes challenge store on unlock.
 * Must be mounted once at the app level after authentication.
 */
export function useChallengeListener() {
  const { t } = useTranslation()
  const fetchChallenges = useChallengeStore((s) => s.fetchChallenges)

  useEffect(() => {
    const socket = getSocket()

    const handleUnlocked = (data: { userId: string; challengeId: string; title: string; icon: string; tier: number }) => {
      toast.success(t('challenges.unlockedToast', { icon: data.icon, title: data.title }), {
        duration: 6000,
      })
      fetchChallenges()
    }

    socket.on('challenge:unlocked', handleUnlocked)

    return () => {
      socket.off('challenge:unlocked', handleUnlocked)
    }
  }, [t, fetchChallenges])
}
