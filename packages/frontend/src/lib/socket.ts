import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: TypedSocket | null = null
let networkListenersAttached = false

let connectionWanted = false

function attachNetworkListeners(target: TypedSocket): void {
  if (networkListenersAttached) return
  networkListenersAttached = true

  const wake = () => {
    if (!connectionWanted) return
    if (!target.connected && !target.active) {
      target.connect()
    } else if (!target.connected) {
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
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
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
  if (socket && (socket.connected || socket.active)) {
    socket.disconnect()
  }
}

export function isSocketConnectionWanted(): boolean {
  return connectionWanted
}
