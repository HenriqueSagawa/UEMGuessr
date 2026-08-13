import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { verifyAccessToken } from '../lib/jwt';
import { AppError } from '../utils/appError';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import * as rankedService from '../modules/ranked/ranked.service';
import { submitAnswerSchema } from '../modules/ranked/ranked.schemas';
import { rankedEvents, RANKED_EVENTS } from './rankedEvents';
import type {
  MatchCreatedEvent,
  QueuedEvent,
  QueueLeftEvent,
  RoundAnsweredEvent,
  RoundResolvedEvent,
} from './rankedEvents';

const PRESENCE_BROADCAST_DEBOUNCE_MS = 300;
const PRESENCE_SWEEP_INTERVAL_MS = 30_000;

const matchStateSchema = z.object({
  matchId: z.string().trim().min(1),
});

const matchAnswerSchema = submitAnswerSchema.extend({
  matchId: z.string().trim().min(1),
  roundNumber: z.number().int().min(1),
});

type AuthenticatedUser = { id: string; role: string };
type RankedMatchState = Awaited<ReturnType<typeof rankedService.getRankedMatch>>;

export interface RankedPresence {
  playersOnline: number;
  playersInQueue: number;
}

export class RankedSocketGateway {
  private ioServer: Server | null = null;
  private io: Namespace | null = null;

  private userSockets = new Map<string, Set<Socket>>();
  private lastSeen = new Map<string, number>();

  private roundTimers = new Map<string, NodeJS.Timeout>();
  private presenceTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor() {
    rankedEvents.on(RANKED_EVENTS.matchCreated, (payload: MatchCreatedEvent) =>
      void this.onMatchCreated(payload),
    );
    rankedEvents.on(RANKED_EVENTS.queued, (payload: QueuedEvent) =>
      void this.onQueued(payload),
    );
    rankedEvents.on(RANKED_EVENTS.queueLeft, (payload: QueueLeftEvent) =>
      void this.onQueueLeft(payload),
    );
    rankedEvents.on(RANKED_EVENTS.roundAnswered, (payload: RoundAnsweredEvent) =>
      void this.onRoundAnswered(payload),
    );
    rankedEvents.on(RANKED_EVENTS.roundResolved, (payload: RoundResolvedEvent) =>
      void this.onRoundResolved(payload),
    );
  }

  attach(httpServer: HttpServer) {
    const ioServer = new Server(httpServer, {
      cors: { origin: env.CORS_ORIGIN ?? env.FRONTEND_URL, credentials: true },
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });

    const rankedNamespace = ioServer.of('/ranked');

    rankedNamespace.use((socket, next) => {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (typeof socket.handshake.query.token === 'string'
          ? socket.handshake.query.token
          : undefined);
      if (!token) return next(new Error('Não autenticado.'));
      try {
        const payload = verifyAccessToken(token);
        socket.data.user = { id: payload.sub, role: payload.role };
        next();
      } catch {
        next(new Error('Token de acesso inválido ou expirado.'));
      }
    });

    rankedNamespace.on('connection', (socket) => {
      try {
        this.handleConnection(socket);
      } catch (error) {
        logger.error({ error }, 'Falha ao registrar conexão ranqueada.');
      }
    });

    this.ioServer = ioServer;
    this.io = rankedNamespace;

    this.sweepTimer = setInterval(() => this.sweepPresence(), PRESENCE_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();

    void this.broadcastPresence();
    void this.recoverRoundTimers();

    logger.info('Gateway de socket.io ranqueado iniciado no namespace /ranked.');
  }

  handleConnection(socket: Socket) {
    const user = socket.data.user as AuthenticatedUser | undefined;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    this.registerUserSocket(user.id, socket);
    this.lastSeen.set(user.id, Date.now());

    socket.on('dev:ping', () => {
      this.lastSeen.set(user.id, Date.now());
      socket.emit('dev:pong', { ts: Date.now() });
    });

    socket.on('queue:join', () => void this.onQueueJoin(socket, user.id));
    socket.on('queue:cancel', () => void this.onQueueCancel(socket, user.id));
    socket.on('queue:status', () => void this.onQueueStatus(socket, user.id));
    socket.on('match:state', (payload: unknown) =>
      void this.onMatchState(socket, user.id, payload),
    );
    socket.on('match:answer', (payload: unknown) =>
      void this.onMatchAnswer(socket, user.id, payload),
    );
    socket.on('disconnect', () => this.unregisterUserSocket(user.id, socket));

    socket.emit('welcome', {
      user: { id: user.id, role: user.role },
      timestamp: new Date().toISOString(),
    });

    void this.syncUserState(socket, user.id);
    this.schedulePresenceBroadcast();
  }

  async getPresence(): Promise<RankedPresence> {
    let playersInQueue = 0;
    try {
      playersInQueue = await prisma.rankedQueueEntry.count({
        where: { status: 'WAITING', expiresAt: { gt: new Date() } },
      });
    } catch (error) {
      logger.error(error, 'Falha ao contar jogadores na fila ranqueada.');
    }
    return {
      playersOnline: this.userSockets.size,
      playersInQueue,
    };
  }

  stop() {
    for (const timer of this.roundTimers.values()) clearTimeout(timer);
    this.roundTimers.clear();

    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.presenceTimer = null;

    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;

    for (const sockets of this.userSockets.values()) {
      for (const socket of sockets) socket.disconnect(true);
    }
    this.userSockets.clear();
    this.lastSeen.clear();

    if (this.io) {
      this.io.disconnectSockets(true);
      this.io = null;
    }
    if (this.ioServer) {
      this.ioServer.close();
      this.ioServer = null;
    }
  }

  // ---------- Conexão / desconexão ----------

  private registerUserSocket(userId: string, socket: Socket) {
    const set = this.userSockets.get(userId) ?? new Set<Socket>();
    set.add(socket);
    this.userSockets.set(userId, set);
  }

  private unregisterUserSocket(userId: string, socket: Socket) {
    const set = this.userSockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      this.userSockets.delete(userId);
      this.lastSeen.delete(userId);
    }
    this.schedulePresenceBroadcast();
  }

  private sweepPresence() {
    const now = Date.now();
    for (const [userId, lastSeen] of this.lastSeen) {
      if (now - lastSeen > PRESENCE_SWEEP_INTERVAL_MS * 2 && !this.userSockets.has(userId)) {
        this.lastSeen.delete(userId);
      }
    }
  }

  private async syncUserState(socket: Socket, userId: string) {
    try {
      const activeMatchId = await rankedService.findUserActiveMatch(userId);
      if (activeMatchId) {
        await this.emitMatchState(socket, activeMatchId, userId, 'match:found');
        return;
      }
      const queue = await rankedService.getRankedQueueStatus(userId);
      if (queue.status === 'matched') {
        await this.emitMatchState(socket, queue.matchId, userId, 'match:found');
        return;
      }
      socket.emit('queue:status', queue);
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  // ---------- Mensagens do cliente ----------

  private async onQueueJoin(socket: Socket, userId: string) {
    try {
      await rankedService.joinRankedQueue(userId);
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  private async onQueueCancel(socket: Socket, userId: string) {
    try {
      await rankedService.leaveRankedQueue(userId);
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  private async onQueueStatus(socket: Socket, userId: string) {
    try {
      const queue = await rankedService.getRankedQueueStatus(userId);
      if (queue.status === 'matched') {
        await this.emitMatchState(socket, queue.matchId, userId, 'match:found');
        return;
      }
      socket.emit('queue:status', queue);
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  private async onMatchState(socket: Socket, userId: string, payload: unknown) {
    const parsed = matchStateSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(socket, new AppError('Dados de partida inválidos.', 422));
      return;
    }
    try {
      await this.emitMatchState(
        socket,
        parsed.data.matchId,
        userId,
        'match:state',
      );
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  private async onMatchAnswer(socket: Socket, userId: string, payload: unknown) {
    const parsed = matchAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendError(socket, new AppError('Palpite inválido.', 422));
      return;
    }
    try {
      await rankedService.submitRankedAnswer(
        parsed.data.matchId,
        userId,
        parsed.data.roundNumber,
        {
          guessLatitude: parsed.data.guessLatitude,
          guessLongitude: parsed.data.guessLongitude,
        },
      );
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  // ---------- Eventos do domínio (ranked.service) ----------

  private async onMatchCreated(payload: MatchCreatedEvent) {
    await Promise.all([
      this.refreshUserMatch(payload.player1Id, payload.matchId, 'match:found'),
      this.refreshUserMatch(payload.player2Id, payload.matchId, 'match:found'),
    ]);
    this.schedulePresenceBroadcast();
  }

  private async onQueued(payload: QueuedEvent) {
    const sockets = this.userSockets.get(payload.userId);
    if (sockets) {
      for (const socket of sockets) {
        socket.emit('queue:joining', {
          queueId: payload.queueId,
          rating: payload.rating,
          expiresAt: payload.expiresAt,
        });
      }
    }
    this.schedulePresenceBroadcast();
  }

  private async onQueueLeft(payload: QueueLeftEvent) {
    const sockets = this.userSockets.get(payload.userId);
    if (sockets) {
      for (const socket of sockets) {
        socket.emit('queue:canceled', { status: 'left' });
      }
    }
    this.schedulePresenceBroadcast();
  }

  private async onRoundAnswered(payload: RoundAnsweredEvent) {
    await Promise.all([
      this.refreshUserMatch(payload.player1Id, payload.matchId, 'match:answered'),
      this.refreshUserMatch(payload.player2Id, payload.matchId, 'match:answered'),
    ]);
  }

  private async onRoundResolved(payload: RoundResolvedEvent) {
    this.clearRoundTimer(payload.matchId);
    const event = payload.finished ? 'match:finished' : 'match:round';
    await Promise.all([
      this.refreshUserMatch(payload.player1Id, payload.matchId, event),
      this.refreshUserMatch(payload.player2Id, payload.matchId, event),
    ]);
  }

  // ---------- Helpers ----------

  private async emitMatchState(
    socket: Socket,
    matchId: string,
    userId: string,
    event: string,
  ) {
    const state = await rankedService.getRankedMatch(matchId, userId);
    this.scheduleRoundTimerForState(state);
    socket.emit(event, state);
  }

  private async refreshUserMatch(userId: string, matchId: string, event: string) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    let state: RankedMatchState;
    try {
      state = await rankedService.getRankedMatch(matchId, userId);
    } catch (error) {
      logger.error(
        { error, matchId, userId },
        'Falha ao notificar partida ranqueada via socket.',
      );
      return;
    }
    this.scheduleRoundTimerForState(state);
    for (const socket of sockets) {
      socket.emit(event, state);
    }
  }

  private scheduleRoundTimerForState(state: {
    match: { id: string; status: string };
    currentRound: { roundNumber: number; deadline: Date };
  }) {
    if (state.match.status !== 'IN_PROGRESS') {
      this.clearRoundTimer(state.match.id);
      return;
    }
    this.scheduleRoundTimer(
      state.match.id,
      state.currentRound.roundNumber,
      state.currentRound.deadline,
    );
  }

  private scheduleRoundTimer(matchId: string, roundNumber: number, deadline: Date) {
    this.clearRoundTimer(matchId);
    const delay = deadline.getTime() - Date.now();
    if (delay <= 0) {
      void this.resolveRoundSafely(matchId, roundNumber);
      return;
    }
    const timer = setTimeout(() => {
      this.roundTimers.delete(matchId);
      void this.resolveRoundSafely(matchId, roundNumber);
    }, delay);
    timer.unref?.();
    this.roundTimers.set(matchId, timer);
  }

  private clearRoundTimer(matchId: string) {
    const timer = this.roundTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(matchId);
    }
  }

  private async resolveRoundSafely(matchId: string, roundNumber: number) {
    try {
      await rankedService.resolveRound(matchId, roundNumber, new Date());
    } catch (error) {
      logger.error(
        { error, matchId, roundNumber },
        'Falha ao resolver rodada ranqueada via timer.',
      );
    }
  }

  private async recoverRoundTimers() {
    try {
      const matches = await prisma.rankedMatch.findMany({
        where: { status: 'IN_PROGRESS' },
        select: {
          id: true,
          rounds: {
            where: { resolvedAt: null },
            orderBy: { roundNumber: 'desc' },
            take: 1,
            select: { roundNumber: true, deadline: true },
          },
        },
      });
      for (const match of matches) {
        const pending = match.rounds[0];
        if (pending) {
          this.scheduleRoundTimer(match.id, pending.roundNumber, pending.deadline);
        }
      }
    } catch (error) {
      logger.error(error, 'Falha ao recuperar temporizadores de rodadas ranqueadas.');
    }
  }

  private async broadcastPresence() {
    const presence = await this.getPresence();
    const payload = {
      playersOnline: presence.playersOnline,
      playersInQueue: presence.playersInQueue,
    };
    for (const sockets of this.userSockets.values()) {
      for (const socket of sockets) {
        socket.emit('presence:update', payload);
      }
    }
  }

  private schedulePresenceBroadcast() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      void this.broadcastPresence();
    }, PRESENCE_BROADCAST_DEBOUNCE_MS);
    this.presenceTimer.unref?.();
  }

  private sendError(socket: Socket, error: unknown) {
    if (error instanceof AppError) {
      socket.emit('error', { code: error.statusCode, message: error.message });
      return;
    }
    logger.error(error, 'Erro não tratado no gateway ranqueado.');
    socket.emit('error', { code: 500, message: 'Erro interno do servidor.' });
  }
}

export const rankedSocketHub = new RankedSocketGateway();