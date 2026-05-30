import { useEffect, useEffectEvent } from 'react'
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
 * The latest `handler` is always invoked without re-subscribing: it is
 * wrapped in `useEffectEvent`, so the socket subscription only churns when
 * the `event` name itself changes (or on mount / unmount). Callers no longer
 * need to memoise their handler for subscription stability.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  // Accepted for backward compatibility with the previous useEffect-style
  // signature. No longer needed for subscription stability (the handler is
  // wrapped in useEffectEvent), so it is intentionally not consumed.
  _deps?: unknown[],
): void {
  // `useEffectEvent` gives us a stable binding that always calls the latest
  // `handler` closure — so it never needs to appear in the effect deps and
  // the subscription doesn't re-run on every render.
  const onEvent = useEffectEvent(((...args: unknown[]) => {
    ;(handler as (...a: unknown[]) => void)(...args)
  }) as ServerToClientEvents[E])

  useEffect(() => {
    const socket = getSocket()
    // socket.io's type machinery can't connect the event name string to
    // the specific handler signature without help — the cast is the
    // standard socket.io-client generic-typed escape hatch.
    socket.on(event, onEvent as never)
    return () => {
      socket.off(event, onEvent as never)
    }
    // `onEvent` is a stable useEffectEvent binding — it must not be a
    // dependency (rules-of-hooks), and exhaustive-deps treats it as exempt.
  }, [event])
}
