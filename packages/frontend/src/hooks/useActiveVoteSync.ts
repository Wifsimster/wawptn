import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useGroupStore } from '@/stores/group.store'

/**
 * Keeps the group list fresh so the global "vote in progress" banner can
 * react app-wide. Fetches the groups once on login and refetches whenever a
 * notification arrives — vote start and vote close both emit one — so the
 * banner appears and clears without the user having to visit the dashboard.
 */
export function useActiveVoteSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null)

  useEffect(() => {
    if (!userId) return

    const refetch = () => {
      void useGroupStore.getState().fetchGroups().catch(() => {
        // Non-critical: a stale banner is harmless, the vote page handles
        // an already-closed session gracefully.
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
