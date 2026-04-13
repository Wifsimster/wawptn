import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useNotificationStore } from '@/stores/notification.store'
import { showNativeNotification } from '@/lib/pwa'

/**
 * Global hook that listens for notification:new socket events
 * and pushes them into the notification store.
 * Must be mounted once at the app level after authentication.
 *
 * When the user has granted native notification permission, the hook also
 * dispatches a native OS notification via the service worker so the bell
 * is audible / visible even when the tab is backgrounded.
 */
export function useNotificationListener() {
  const { addNotification, fetchNotifications } = useNotificationStore()

  useEffect(() => {
    // Fetch existing unread notifications on mount
    fetchNotifications()

    const socket = getSocket()

    const handleNewNotification = (data: Parameters<typeof addNotification>[0]) => {
      addNotification(data)

      // Fire a native OS notification in parallel when the user has opted
      // in. showNativeNotification() returns false without throwing if
      // permission is missing or the SW isn't ready, so this call is a
      // pure enhancement — the in-app bell stays authoritative.
      const title = data.title || 'WAWPTN'
      void showNativeNotification(title, {
        body: data.body || undefined,
        tag: `notification:${data.id}`,
        data: data.metadata ?? {},
      })
    }

    socket.on('notification:new', handleNewNotification)

    return () => {
      socket.off('notification:new', handleNewNotification)
    }
  }, [addNotification, fetchNotifications])
}
