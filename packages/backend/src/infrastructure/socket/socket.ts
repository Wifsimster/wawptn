import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'
import { auth } from '../auth/auth.js'
import { db } from '../database/connection.js'
import { socketLogger } from '../logger/logger.js'
import { env } from '../../config/env.js'

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

let io: TypedServer

export function createSocketServer(httpServer: HttpServer): TypedServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    path: '/socket.io',
    pingTimeout: 20000,
    pingInterval: 25000,
  })

  // Auth middleware — verify session on every connection
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie
      if (!cookieHeader) {
        return next(new Error('unauthorized'))
      }

      // Verify session via Better Auth
      const request = new Request(`${env.API_URL}/api/auth/get-session`, {
        headers: { cookie: cookieHeader },
      })
      const session = await auth.api.getSession({ headers: request.headers })

      if (!session?.user) {
        return next(new Error('unauthorized'))
      }

      socket.data.userId = session.user.id
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    socketLogger.info({ userId: socket.data.userId }, 'client connected')

    socket.on('group:join', async (groupId) => {
      // Verify membership before joining room
      const membership = await db('group_members')
        .where({ group_id: groupId, user_id: socket.data.userId })
        .first()

      if (membership) {
        await socket.join(`group:${groupId}`)
        socketLogger.debug({ userId: socket.data.userId, groupId }, 'joined group room')
      }
    })

    socket.on('group:leave', async (groupId) => {
      await socket.leave(`group:${groupId}`)
    })

    socket.on('disconnect', () => {
      socketLogger.debug({ userId: socket.data.userId }, 'client disconnected')
    })
  })

  return io
}

export function getIO(): TypedServer {
  if (!io) throw new Error('Socket.io not initialized')
  return io
}
