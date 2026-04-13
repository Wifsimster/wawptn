import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useSocketStore } from '@/stores/socket.store'

/**
 * Mount once at the app shell. Binds the socket store to the socket.io
 * client's connection events and surfaces user-visible feedback when
 * the connection drops or recovers.
 *
 * We deliberately swallow the initial idle → connecting → connected
 * transition (no toast on first page load) and only pop a toast on:
 *   - transition from connected → reconnecting  ("lost connection")
 *   - transition from reconnecting → connected  ("back online")
 *   - state == 'error' with a lastError          ("connection error")
 *
 * Toasts are identified by a stable id so a flapping connection only
 * updates the existing toast instead of stacking new ones.
 */
export function useSocketConnectionStatus() {
  const { t } = useTranslation()
  const bind = useSocketStore((s) => s.bind)
  const state = useSocketStore((s) => s.state)
  const lastError = useSocketStore((s) => s.lastError)
  const previousStateRef = useRef(state)

  // Bind the store on first mount. Idempotent — bind() is a no-op on
  // subsequent calls so a HMR re-render won't double-wire listeners.
  useEffect(() => {
    const teardown = bind()
    return () => {
      teardown()
    }
  }, [bind])

  useEffect(() => {
    const previous = previousStateRef.current
    previousStateRef.current = state

    // Connected → reconnecting: show the "lost connection" toast.
    if (previous === 'connected' && state === 'reconnecting') {
      toast.warning(t('socket.lostConnection'), {
        id: 'socket-status',
        description: t('socket.tryingToReconnect'),
        duration: Number.POSITIVE_INFINITY,
      })
      return
    }

    // Reconnecting → connected: celebrate the recovery, dismiss quickly.
    if (previous === 'reconnecting' && state === 'connected') {
      toast.success(t('socket.reconnected'), {
        id: 'socket-status',
        duration: 2500,
      })
      return
    }

    // Hard error state: show the last error with a manual dismiss.
    if (state === 'error' && lastError) {
      toast.error(t('socket.connectionError'), {
        id: 'socket-status',
        description: lastError,
        duration: Number.POSITIVE_INFINITY,
      })
      return
    }

    // Connected from any other state: clear the status toast if it's up.
    if (state === 'connected' && previous !== 'connected' && previous !== 'idle') {
      toast.dismiss('socket-status')
    }
  }, [state, lastError, t])
}
