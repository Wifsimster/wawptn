import { create } from 'zustand'
import { getSocket, isSocketConnectionWanted } from '@/lib/socket'

export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized'
  | 'error'

const AUTH_ERROR_MESSAGES = new Set(['unauthorized', 'Unauthorized'])

interface SocketStoreState {
  state: SocketConnectionState
  reconnectAttempts: number
  lastError: string | null
  reconnectCount: number
  isConnected: boolean
}

interface SocketStoreActions {
  bind: () => () => void
  reset: () => void
}

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
      if (reason === 'io client disconnect') {
        set({ state: 'disconnected', isConnected: false })
        return
      }
      set({ state: 'reconnecting', isConnected: false })
    }
    const onConnectError = (error: Error) => {
      if (AUTH_ERROR_MESSAGES.has(error.message)) {
        set({ state: 'unauthorized', isConnected: false, lastError: null })
        return
      }

      if (!isSocketConnectionWanted()) {
        set({ state: 'disconnected', isConnected: false, lastError: null })
        return
      }

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
    socket.io.on('reconnect_attempt', onReconnectAttempt)
    socket.io.on('reconnect_error', onReconnectError)
    socket.io.on('reconnect_failed', () => {
      if (!isSocketConnectionWanted()) {
        set({ state: 'disconnected', isConnected: false, lastError: null })
        return
      }
      set({ state: 'error', lastError: 'Reconnection failed after max attempts' })
    })

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
