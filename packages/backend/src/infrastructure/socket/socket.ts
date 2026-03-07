import { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from '@wawptn/types'
import { db } from '../database/connection.js'
import { socketLogger } from '../logger/logger.js'
import { env } from '../../config/env.js'

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>

let io: TypedServer

// In-memory presence: groupId -> Set<userId>
const groupPresence = new Map<string, Set<string>>()

function addPresence(groupId: string, userId: string): boolean {
  let members = groupPresence.get(groupId)
  if (!members) {
    members = new Set()
    groupPresence.set(groupId, members)
  }
  const wasNew = !members.has(userId)
  members.add(userId)
  return wasNew
}

function removePresence(groupId: string, userId: string): boolean {
  const members = groupPresence.get(groupId)
  if (!members) return false
  const removed = members.delete(userId)
  if (members.size === 0) groupPresence.delete(groupId)
  return removed
}

function getPresence(groupId: string): string[] {
  return Array.from(groupPresence.get(groupId) ?? [])
}

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

      // Parse session token from cookie header
      const match = cookieHeader.match(/wawptn\.session_token=([^;]+)/)
      const sessionToken = match?.[1]
      if (!sessionToken) {
        return next(new Error('unauthorized'))
      }

      const session = await db('sessions')
        .where({ token: sessionToken })
        .where('expires_at', '>', new Date())
        .first()

      if (!session) {
        return next(new Error('unauthorized'))
      }

      socket.data.userId = session.user_id
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

        // Send current presence list to the joining socket
        socket.emit('group:presence', { onlineUserIds: getPresence(groupId) })

        // Track presence and notify others
        const wasNew = addPresence(groupId, socket.data.userId)
        if (wasNew) {
          socket.to(`group:${groupId}`).emit('member:online', { groupId, userId: socket.data.userId })
        }
      }
    })

    socket.on('group:leave', async (groupId) => {
      await socket.leave(`group:${groupId}`)

      // Check if user still has other sockets in this room
      const room = io.sockets.adapter.rooms.get(`group:${groupId}`)
      const stillConnected = room && Array.from(room).some((socketId) => {
        const s = io.sockets.sockets.get(socketId)
        return s && s.data.userId === socket.data.userId
      })

      if (!stillConnected) {
        const removed = removePresence(groupId, socket.data.userId)
        if (removed) {
          io.to(`group:${groupId}`).emit('member:offline', { groupId, userId: socket.data.userId })
        }
      }
    })

    socket.on('disconnect', () => {
      socketLogger.debug({ userId: socket.data.userId }, 'client disconnected')

      // Remove presence from all groups this user was in
      for (const [groupId, members] of groupPresence.entries()) {
        if (members.has(socket.data.userId)) {
          // Check if user has other sockets still in this group room
          const room = io.sockets.adapter.rooms.get(`group:${groupId}`)
          const stillConnected = room && Array.from(room).some((socketId) => {
            const s = io.sockets.sockets.get(socketId)
            return s && s.data.userId === socket.data.userId
          })

          if (!stillConnected) {
            removePresence(groupId, socket.data.userId)
            io.to(`group:${groupId}`).emit('member:offline', { groupId, userId: socket.data.userId })
          }
        }
      }
    })
  })

  return io
}

export function forceLeaveRoom(groupId: string, userId: string): void {
  if (!io) return
  const room = io.sockets.adapter.rooms.get(`group:${groupId}`)
  if (!room) return
  for (const socketId of Array.from(room)) {
    const s = io.sockets.sockets.get(socketId)
    if (s && s.data.userId === userId) {
      s.leave(`group:${groupId}`)
    }
  }
  removePresence(groupId, userId)
}

export function getIO(): TypedServer {
  if (!io) throw new Error('Socket.io not initialized')
  return io
}
