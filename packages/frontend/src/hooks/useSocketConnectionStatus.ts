import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useSocketStore } from '@/stores/socket.store'

export function useSocketConnectionStatus() {
  const { t } = useTranslation()
  const bind = useSocketStore((s) => s.bind)
  const state = useSocketStore((s) => s.state)
  const lastError = useSocketStore((s) => s.lastError)
  const previousStateRef = useRef(state)

  useEffect(() => {
    const teardown = bind()
    return () => {
      teardown()
    }
  }, [bind])

  useEffect(() => {
    const previous = previousStateRef.current
    previousStateRef.current = state

    if (previous === 'connected' && state === 'reconnecting') {
      toast.warning(t('socket.lostConnection'), {
        id: 'socket-status',
        description: t('socket.tryingToReconnect'),
        duration: Number.POSITIVE_INFINITY,
      })
      return
    }

    if (previous === 'reconnecting' && state === 'connected') {
      toast.success(t('socket.reconnected'), {
        id: 'socket-status',
        duration: 2500,
      })
      return
    }

    if (state === 'error' && lastError) {
      toast.error(t('socket.connectionError'), {
        id: 'socket-status',
        description: lastError,
        duration: Number.POSITIVE_INFINITY,
      })
      return
    }

    if (state === 'unauthorized') {
      toast.dismiss('socket-status')
      return
    }

    if (state === 'connected' && previous !== 'connected' && previous !== 'idle') {
      toast.dismiss('socket-status')
    }
  }, [state, lastError, t])
}
