import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import { useChallengeStore } from '@/stores/challenge.store'

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
