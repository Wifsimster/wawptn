import { EventEmitter } from 'node:events'
import type { VoteResult } from '@wawptn/types'

export interface SessionCreatedEvent {
  sessionId: string
  groupId: string
  createdBy: string
  participantIds: string[]
  games: Array<{ steamAppId: number; gameName: string; headerImageUrl: string | null }>
  scheduledAt?: Date
}

export interface SessionClosedEvent {
  sessionId: string
  groupId: string
  result: VoteResult
  participantIds: string[]
}

export interface ChallengeUnlockedEvent {
  userId: string
  challengeId: string
  challengeName: string
  tier: string
}

// Strongly typed EventEmitter wrapper
export interface DomainEventMap {
  'session:created': [SessionCreatedEvent]
  'session:closed': [SessionClosedEvent]
  'challenge:unlocked': [ChallengeUnlockedEvent]
}

class DomainEventBus extends EventEmitter {
  emit<K extends keyof DomainEventMap>(event: K, ...args: DomainEventMap[K]): boolean {
    return super.emit(event, ...args)
  }

  on<K extends keyof DomainEventMap>(event: K, listener: (...args: DomainEventMap[K]) => void): this {
    return super.on(event, listener)
  }

  off<K extends keyof DomainEventMap>(event: K, listener: (...args: DomainEventMap[K]) => void): this {
    return super.off(event, listener)
  }
}

// Singleton domain event bus
export const domainEvents = new DomainEventBus()
domainEvents.setMaxListeners(50)
