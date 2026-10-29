import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useNotificationStore } from '@/stores/notification.store'
import { useAuthStore } from '@/stores/auth.store'
import { showNativeNotification } from '@/lib/pwa'

export function useNotificationListener() {
  const { addNotification, fetchNotifications } = useNotificationStore()
  const userId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    if (!userId) return

    fetchNotifications()

    const socket = getSocket()

    const handleNewNotification = (data: Parameters<typeof addNotification>[0]) => {
      addNotification(data)

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
  }, [addNotification, fetchNotifications, userId])
}
