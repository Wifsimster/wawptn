import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import type { ServerToClientEvents } from '@wawptn/types'

/**
 * Thin wrapper over `socket.on(event, handler)` / `socket.off(event, handler)`
 * with proper React lifecycle hygiene. Replaces the ~8 lines of boilerplate
 * each page used to write to subscribe to a server event:
 *
 *   useEffect(() => {
 *     const socket = getSocket()
 *     const handler = (data: X) => { ... }
 *     socket.on('foo', handler)
 *     return () => socket.off('foo', handler)
 *   }, [deps])
 *
 * becomes:
 *
 *   useSocketEvent('foo', (data: X) => { ... }, [deps])
 *
 * The hook is deliberately typed against ServerToClientEvents so the
 * handler's payload argument is inferred from the event name. The deps
 * array works like any other hook's — pass a stable handler or list its
 * dependencies explicitly.
 *
 * Note: we intentionally re-subscribe on every render when deps change.
 * Callers that need referential stability should wrap their handler in
 * useCallback — this matches the ergonomics of React.useEffect itself.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  // Default `[]` mirrors useEffect semantics when called without deps —
  // the listener attaches once on mount and detaches on unmount.
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const socket = getSocket()
    // socket.io's type machinery can't connect the event name string to
    // the specific handler signature without help — the cast is the
    // standard socket.io-client generic-typed escape hatch.
    socket.on(event, handler as never)
    return () => {
      socket.off(event, handler as never)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps])
}
