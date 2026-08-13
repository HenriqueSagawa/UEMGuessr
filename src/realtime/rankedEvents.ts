import { EventEmitter } from 'node:events';

export const RANKED_EVENTS = {
  matchCreated: 'ranked:match-created',
  queued: 'ranked:queued',
  queueLeft: 'ranked:queue-left',
  roundAnswered: 'ranked:round-answered',
  roundResolved: 'ranked:round-resolved',
} as const;

export interface MatchCreatedEvent {
  matchId: string;
  player1Id: string;
  player2Id: string;
}

export interface QueuedEvent {
  userId: string;
  queueId: string;
  rating: number;
  expiresAt: Date;
}

export interface QueueLeftEvent {
  userId: string;
}

export interface RoundAnsweredEvent {
  matchId: string;
  roundNumber: number;
  player1Id: string;
  player2Id: string;
}

export interface RoundResolvedEvent {
  matchId: string;
  roundNumber: number;
  finished: boolean;
  winnerId: string | null;
  player1Id: string;
  player2Id: string;
}

class RankedEventEmitter extends EventEmitter {
  emitMatchCreated(payload: MatchCreatedEvent) {
    this.emit(RANKED_EVENTS.matchCreated, payload);
  }

  emitQueued(payload: QueuedEvent) {
    this.emit(RANKED_EVENTS.queued, payload);
  }

  emitQueueLeft(payload: QueueLeftEvent) {
    this.emit(RANKED_EVENTS.queueLeft, payload);
  }

  emitRoundAnswered(payload: RoundAnsweredEvent) {
    this.emit(RANKED_EVENTS.roundAnswered, payload);
  }

  emitRoundResolved(payload: RoundResolvedEvent) {
    this.emit(RANKED_EVENTS.roundResolved, payload);
  }
}

export const rankedEvents = new RankedEventEmitter();