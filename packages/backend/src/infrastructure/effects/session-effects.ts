// This file subscribes to domain events and triggers the appropriate side effects.
// It's the ONLY place where domain events get translated to Socket.io, Discord, and notifications.

import { domainEvents } from '../../domain/events/event-bus.js'
import { getIO } from '../socket/socket.js'
import { notifySessionCreated, notifyVoteClosed } from '../discord/notifier.js'
import { createNotification } from '../notifications/notification-service.js'
import { logger } from '../logger/logger.js'
import { db } from '../database/connection.js'

export function registerSessionEffects(): void {
  domainEvents.on('session:created', async (event) => {
    // Emit Socket.io event
    try {
      getIO().to(`group:${event.groupId}`).emit('session:created', {
        sessionId: event.sessionId,
        groupId: event.groupId,
        createdBy: event.createdBy,
        participantIds: event.participantIds,
        ...(event.scheduledAt ? { scheduledAt: event.scheduledAt.toISOString() } : {}),
      })
    } catch (err) {
      logger.warn({ error: String(err), groupId: event.groupId }, 'socket emit session:created failed')
    }

    // Send Discord webhook (non-blocking)
    notifySessionCreated(event.groupId, event.sessionId, event.games).catch((err) =>
      logger.warn({ error: String(err), groupId: event.groupId }, 'Discord session notification failed')
    )

    // In-app notifications
    try {
      const group = await db('groups').where({ id: event.groupId }).first()
      const groupName = group?.name || 'Groupe'
      const recipients = event.participantIds.filter((uid) => uid !== event.createdBy)
      if (recipients.length > 0) {
        createNotification({
          type: 'vote_opened',
          title: `Un vote a commencé dans ${groupName}`,
          body: `${event.games.length} jeux en commun sont soumis au vote.`,
          groupId: event.groupId,
          createdBy: event.createdBy,
          metadata: { sessionId: event.sessionId, actionUrl: `/groups/${event.groupId}/vote` },
          recipientUserIds: recipients,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }).catch((err) =>
          logger.warn({ error: String(err), groupId: event.groupId }, 'in-app vote notification failed')
        )
      }
    } catch (err) {
      logger.warn({ error: String(err), groupId: event.groupId }, 'failed to load group for notification')
    }
  })

  domainEvents.on('session:closed', async (event) => {
    // Emit Socket.io event
    try {
      getIO().to(`group:${event.groupId}`).emit('vote:closed', { sessionId: event.sessionId, result: event.result })
    } catch (err) {
      logger.warn({ error: String(err), groupId: event.groupId }, 'socket emit vote:closed failed')
    }

    // Discord webhook
    notifyVoteClosed(event.groupId, event.result).catch((err) =>
      logger.warn({ error: String(err), groupId: event.groupId }, 'Discord notification failed')
    )

    // In-app notification
    try {
      const group = await db('groups').where({ id: event.groupId }).first()
      const groupName = group?.name || 'Groupe'
      if (event.participantIds.length > 0 && event.result.gameName && event.result.gameName !== 'Unknown') {
        createNotification({
          type: 'vote_closed',
          title: `${event.result.gameName} a gagné dans ${groupName} !`,
          body: `${event.result.yesCount} sur ${event.result.totalVoters} ont voté pour.`,
          groupId: event.groupId,
          metadata: {
            sessionId: event.sessionId,
            winnerAppId: event.result.steamAppId,
            winnerName: event.result.gameName,
            actionUrl: `/groups/${event.groupId}/vote`,
          },
          recipientUserIds: event.participantIds,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }).catch((err) =>
          logger.warn({ error: String(err), groupId: event.groupId }, 'in-app vote closed notification failed')
        )
      }
    } catch (err) {
      logger.warn({ error: String(err), groupId: event.groupId }, 'failed to load group for closed notification')
    }
  })

  logger.info('session effects registered')
}
