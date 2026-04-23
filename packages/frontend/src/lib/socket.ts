import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: TypedSocket | null = null
let networkListenersAttached = false

/**
 * Wake-up handler for the three signals that correlate with "mobile user just
 * came back to the tab or the network came back":
 *
 * - `visibilitychange` → fires when the user switches back to our tab from
 *   Discord/Messenger/the browser switcher. iOS Safari freezes inactive tabs;
 *   the old socket is almost always dead by the time they return.
 * - `online` → fires on Wi-Fi ↔ cellular transitions and when airplane mode
 *   is toggled off. socket.io's internal reconnect loop may have given up by
 *   the time the radio comes back.
 * - `focus` → fallback for browsers that don't fire `visibilitychange`
 *   reliably (older iOS PWA mode).
 *
 * Each handler calls `connect()`, which is a no-op when the socket is already
 * connected or actively reconnecting. Safe to trigger on every wake-up.
 */
function attachNetworkListeners(target: TypedSocket): void {
  if (networkListenersAttached) return
  networkListenersAttached = true

  const wake = () => {
    if (!target.connected && !target.active) {
      target.connect()
    } else if (!target.connected) {
      // `active` is true during the internal reconnect loop. Nudging
      // connect() here is still safe (it short-circuits), but the real value
      // is logging the wake event for diagnostics on flaky mobile networks.
      target.connect()
    }
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake()
  })
  window.addEventListener('online', wake)
  window.addEventListener('focus', wake)
}

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      withCredentials: true,
      autoConnect: false,
      // Explicit reconnection tuning. socket.io-client has reconnect on
      // by default, but the defaults are conservative; we want faster
      // feedback on the first few attempts (500ms / 1s / 2s / 4s ...)
      // and a ceiling so we don't DoS ourselves on a long outage.
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      // Exponential backoff factor (socket.io multiplies the delay by
      // a random factor in [1 - randomizationFactor, 1 + randomizationFactor]).
      randomizationFactor: 0.5,
      timeout: 20_000,
    })
    attachNetworkListeners(socket)
  }
  return socket
}

export function connectSocket(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}
