import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: TypedSocket | null = null
let networkListenersAttached = false

/**
 * Whether the app *wants* a live socket right now. Only ever true while an
 * authenticated session is mounted (App flips it via connectSocket /
 * disconnectSocket).
 *
 * The handshake is authenticated server-side from the session cookie, so a
 * connect attempt made while logged out is always rejected with
 * `unauthorized`. The wake handlers below must therefore respect this
 * intent instead of reconnecting blindly, otherwise a logged-out visitor
 * tabbing back to the landing page triggers a doomed handshake — and a
 * "Erreur de connexion / unauthorized" toast.
 */
let connectionWanted = false

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
    // No authenticated session → nothing to reconnect to. Bailing here keeps
    // the landing page free of rejected handshakes.
    if (!connectionWanted) return
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
  connectionWanted = true
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  connectionWanted = false
  // `connected` is false while a handshake or the internal reconnect loop is
  // still in flight; `active` covers that window. Disconnecting in both cases
  // makes sure logging out actually tears the attempt down instead of letting
  // a pending unauthorized handshake land later.
  if (socket && (socket.connected || socket.active)) {
    socket.disconnect()
  }
}

/** True while an authenticated session wants the socket up. */
export function isSocketConnectionWanted(): boolean {
  return connectionWanted
}
