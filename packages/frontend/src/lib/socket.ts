import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: TypedSocket | null = null

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
