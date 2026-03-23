import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useNotificationStore } from '@/stores/notification.store'

/**
 * Global hook that listens for notification:new socket events
 * and pushes them into the notification store.
 * Must be mounted once at the app level after authentication.
 */
export function useNotificationListener() {
  const { addNotification, fetchNotifications } = useNotificationStore()

  useEffect(() => {
    // Fetch existing unread notifications on mount
    fetchNotifications()

    const socket = getSocket()

    const handleNewNotification = (data: Parameters<typeof addNotification>[0]) => {
      addNotification(data)
    }

    socket.on('notification:new', handleNewNotification)

    return () => {
      socket.off('notification:new', handleNewNotification)
    }
  }, [addNotification, fetchNotifications])
}
