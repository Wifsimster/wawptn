import { create } from 'zustand'
import { getSocket } from '@/lib/socket'

/**
 * Connection state machine mirrored from socket.io-client's internal
 * states. `idle` is a pre-connect bootstrap state — we've not even
 * attempted yet — which lets the connection-status toast stay silent on
 * initial page load.
 */
export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

interface SocketStoreState {
  state: SocketConnectionState
  reconnectAttempts: number
  /** The last transport-level error message, if any. */
  lastError: string | null
  /** Number of times the socket has successfully reconnected this session. */
  reconnectCount: number
  /** Convenience selector used by UI components that just want a boolean. */
  isConnected: boolean
}

interface SocketStoreActions {
  bind: () => () => void
  reset: () => void
}

/**
 * Zustand store that tracks the live connection state of the shared
 * socket.io client. The store never *owns* the socket — `getSocket()` still
 * returns the underlying client and pages can subscribe to individual
 * events directly. The store only *observes* the built-in connect /
 * disconnect / reconnect events and exposes them to React components via
 * a reactive selector.
 *
 * Yuki #1 asked for:
 *   - isConnected / reconnectAttempts / lastError state
 *   - auto-reconnect feedback in the UI
 *   - a single bind() call so pages don't have to re-register listeners
 *
 * All three are covered by this store + useSocketConnectionStatus.
 */
const initialState: SocketStoreState = {
  state: 'idle',
  reconnectAttempts: 0,
  lastError: null,
  reconnectCount: 0,
  isConnected: false,
}

let bound = false

export const useSocketStore = create<SocketStoreState & SocketStoreActions>((set, get) => ({
  ...initialState,

  /**
   * Wire the socket.io client's connection events into this store.
   * Idempotent — calling bind() more than once is a no-op after the
   * first call, so it's safe to invoke from a top-level mount effect.
   *
   * Returns a teardown function that removes the listeners. In practice
   * we never tear down (the socket is a module-singleton for the app
   * lifetime), but returning a cleanup keeps the hook lifecycle honest.
   */
  bind: () => {
    if (bound) return () => {}
    bound = true

    const socket = getSocket()

    const onConnect = () => {
      const current = get()
      set({
        state: 'connected',
        isConnected: true,
        reconnectAttempts: 0,
        lastError: null,
        reconnectCount: current.state === 'reconnecting' ? current.reconnectCount + 1 : current.reconnectCount,
      })
    }
    const onDisconnect = (reason: string) => {
      // 'io client disconnect' means we called disconnect() ourselves —
      // don't enter the reconnect loop in that case, it's a clean exit.
      if (reason === 'io client disconnect') {
        set({ state: 'disconnected', isConnected: false })
        return
      }
      set({ state: 'reconnecting', isConnected: false })
    }
    const onConnectError = (error: Error) => {
      set({
        state: 'error',
        isConnected: false,
        lastError: error.message,
      })
    }
    const onReconnectAttempt = (attempt: number) => {
      set({ state: 'reconnecting', reconnectAttempts: attempt })
    }
    const onReconnectError = (error: Error) => {
      set({ lastError: error.message })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    // socket.io's Manager exposes these through the `io` attribute.
    socket.io.on('reconnect_attempt', onReconnectAttempt)
    socket.io.on('reconnect_error', onReconnectError)
    socket.io.on('reconnect_failed', () =>
      set({ state: 'error', lastError: 'Reconnection failed after max attempts' }),
    )

    // Seed the state from the current socket status in case bind() runs
    // after the connection has already been established (rare but
    // possible on HMR).
    if (socket.connected) {
      set({ state: 'connected', isConnected: true })
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.io.off('reconnect_attempt', onReconnectAttempt)
      socket.io.off('reconnect_error', onReconnectError)
      bound = false
    }
  },

  reset: () => set(initialState),
}))
