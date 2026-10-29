import { useEffect, useEffectEvent } from 'react'
import { getSocket } from '@/lib/socket'
import type { ServerToClientEvents } from '@wawptn/types'

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  _deps?: unknown[],
): void {
  const onEvent = useEffectEvent(((...args: unknown[]) => {
    ;(handler as (...a: unknown[]) => void)(...args)
  }) as ServerToClientEvents[E])

  useEffect(() => {
    const socket = getSocket()
    socket.on(event, onEvent as never)
    return () => {
      socket.off(event, onEvent as never)
    }
  }, [event])
}
