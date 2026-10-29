import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useGroupStore } from '@/stores/group.store'

export function useActiveVoteSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    if (!userId) return

    const refetch = () => {
      void useGroupStore.getState().fetchGroups().catch(() => {
      })
    }

    refetch()
    const socket = getSocket()
    socket.on('notification:new', refetch)
    return () => {
      socket.off('notification:new', refetch)
    }
  }, [userId])
}
