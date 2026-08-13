import type { Socket } from 'socket.io';
import { rankedSocketHub } from '../rankedSocket';
import { rankedEvents } from '../rankedEvents';
import * as rankedService from '../../modules/ranked/ranked.service';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/appError';

jest.mock('../../modules/ranked/ranked.service', () => ({
  findUserActiveMatch: jest.fn(),
  getRankedQueueStatus: jest.fn(),
  joinRankedQueue: jest.fn(),
  leaveRankedQueue: jest.fn(),
  getRankedMatch: jest.fn(),
  submitRankedAnswer: jest.fn(),
  resolveRound: jest.fn(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    rankedQueueEntry: { count: jest.fn() },
    rankedMatch: { findMany: jest.fn() },
  },
}));

const mockFindActiveMatch = rankedService.findUserActiveMatch as jest.Mock;
const mockQueueStatus = rankedService.getRankedQueueStatus as jest.Mock;
const mockJoinQueue = rankedService.joinRankedQueue as jest.Mock;
const mockLeaveQueue = rankedService.leaveRankedQueue as jest.Mock;
const mockGetMatch = rankedService.getRankedMatch as jest.Mock;
const mockSubmitAnswer = rankedService.submitRankedAnswer as jest.Mock;
const mockQueueCount = prisma.rankedQueueEntry.count as jest.Mock;

type FakeSocketResult = {
  socket: Socket;
  handlers: Record<string, (...args: any[]) => void>;
  emitted: Array<{ event: string; payload: any }>;
  emitByEvent: (event: string) => Array<{ event: string; payload: any }>;
  lastOf: (event: string) => any;
};

function createFakeSocket(
  user: { id: string; role: string },
): FakeSocketResult {
  const emitted: Array<{ event: string; payload: any }> = [];
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    data: { user },
    connected: true,
    disconnect: jest.fn(),
    emit: jest.fn((event: string, payload?: any) => {
      emitted.push({ event, payload });
    }),
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = cb;
    }),
  } as unknown as Socket;
  return {
    socket,
    handlers,
    emitted,
    emitByEvent: (event) => emitted.filter((e) => e.event === event),
    lastOf: (event) => {
      const matches = emitted.filter((e) => e.event === event);
      return matches.length > 0 ? matches[matches.length - 1]!.payload : undefined;
    },
  };
}

const activeState = () => ({
  match: { id: 'm1', status: 'IN_PROGRESS', roundNumber: 1 },
  currentRound: { roundNumber: 1, deadline: new Date(Date.now() + 20_000) },
});

const finishedState = () => ({
  match: { id: 'm1', status: 'FINISHED', winnerId: 'user-1', roundNumber: 1 },
  currentRound: { roundNumber: 1, deadline: new Date(Date.now() - 1_000) },
});

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(600);
  await Promise.resolve();
  await Promise.resolve();
}

describe('RankedSocketGateway', () => {
  let alice: FakeSocketResult;
  let bob: FakeSocketResult;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    rankedSocketHub.stop();
    mockQueueCount.mockResolvedValue(0);
    mockFindActiveMatch.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('conexão e presença', () => {
    it('registra o usuário, envia welcome e divulga a presença', async () => {
      mockQueueStatus.mockResolvedValue({ status: 'not_queued' });
      mockQueueCount.mockResolvedValue(3);

      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      expect(alice.lastOf('welcome')).toMatchObject({ user: { id: 'user-1' } });

      await flush();

      expect(mockFindActiveMatch).toHaveBeenCalledWith('user-1');
      expect(mockQueueStatus).toHaveBeenCalledWith('user-1');
      expect(alice.lastOf('presence:update')).toEqual({
        playersOnline: 1,
        playersInQueue: 3,
      });
    });

    it('conta usuários distintos mesmo com múltiplas abas', async () => {
      mockQueueStatus.mockResolvedValue({ status: 'not_queued' });

      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      bob = createFakeSocket({ id: 'user-1', role: 'USER' });
      const carol = createFakeSocket({ id: 'user-2', role: 'USER' });

      rankedSocketHub.handleConnection(alice.socket);
      rankedSocketHub.handleConnection(bob.socket);
      rankedSocketHub.handleConnection(carol.socket);

      await flush();

      expect(carol.lastOf('presence:update')).toMatchObject({
        playersOnline: 2,
      });

      alice.handlers['disconnect']!();
      await flush();
      expect(carol.lastOf('presence:update')).toMatchObject({
        playersOnline: 2,
      });

      bob.handlers['disconnect']!();
      await flush();
      expect(carol.lastOf('presence:update')).toMatchObject({
        playersOnline: 1,
      });
    });

    it('ignora a conexão quando o usuário não foi autenticado', () => {
      const socket = { data: {}, disconnect: jest.fn() } as unknown as Socket;
      rankedSocketHub.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('fila', () => {
    it('entra na fila via message event', async () => {
      mockJoinQueue.mockResolvedValue({ status: 'queued', queueId: 'q1' });
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['queue:join']!();

      await flush();
      expect(mockJoinQueue).toHaveBeenCalledWith('user-1');
    });

    it('cancela a fila via message event', async () => {
      mockLeaveQueue.mockResolvedValue({ status: 'left' });
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['queue:cancel']!();

      await flush();
      expect(mockLeaveQueue).toHaveBeenCalledWith('user-1');
    });

    it('consulta o status da fila e avisa quando foi pareado', async () => {
      mockQueueStatus.mockResolvedValue({ status: 'matched', matchId: 'm1' });
      mockGetMatch.mockResolvedValue(activeState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['queue:status']!();

      await flush();
      expect(mockGetMatch).toHaveBeenCalledWith('m1', 'user-1');
      expect(alice.lastOf('match:found')).toMatchObject({
        match: { id: 'm1' },
        currentRound: { roundNumber: 1 },
      });
    });

    it('envia erro quando já está em uma partida', async () => {
      mockJoinQueue.mockRejectedValue(
        new AppError('Você já está em uma partida ranqueada.', 409),
      );
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['queue:join']!();

      await flush();
      expect(alice.lastOf('error')).toMatchObject({
        code: 409,
        message: 'Você já está em uma partida ranqueada.',
      });
    });
  });

  describe('partida', () => {
    it('responde a rodada com dados válidos', async () => {
      mockSubmitAnswer.mockResolvedValue(activeState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['match:answer']!({
        matchId: 'm1',
        roundNumber: 1,
        guessLatitude: -23.4,
        guessLongitude: -51.9,
      });

      await flush();
      expect(mockSubmitAnswer).toHaveBeenCalledWith('m1', 'user-1', 1, {
        guessLatitude: -23.4,
        guessLongitude: -51.9,
      });
      expect(alice.emitByEvent('error')).toHaveLength(0);
    });

    it('rejeita palpite inválido', async () => {
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['match:answer']!({
        matchId: 'm1',
        roundNumber: 1,
        guessLatitude: 999,
        guessLongitude: 0,
      });

      await flush();
      expect(mockSubmitAnswer).not.toHaveBeenCalled();
      expect(alice.lastOf('error')).toMatchObject({ code: 422 });
    });

    it('rejeita resposta para rodada que não é a partida atual', async () => {
      mockSubmitAnswer.mockRejectedValue(
        new AppError('Esta não é a rodada atual da partida.', 409),
      );
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['match:answer']!({
        matchId: 'm1',
        roundNumber: 2,
        guessLatitude: 0,
        guessLongitude: 0,
      });

      await flush();
      expect(alice.lastOf('error')).toMatchObject({ code: 409 });
    });

    it('solicita o estado completo de uma partida', async () => {
      mockGetMatch.mockResolvedValue(activeState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      alice.handlers['match:state']!({ matchId: 'm1' });

      await flush();
      expect(mockGetMatch).toHaveBeenCalledWith('m1', 'user-1');
      expect(alice.lastOf('match:state')).toMatchObject({
        match: { id: 'm1' },
      });
    });
  });

  describe('eventos do domínio', () => {
    it('notifica ambos os jogadores quando a partida é criada', async () => {
      mockGetMatch.mockResolvedValue(activeState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      bob = createFakeSocket({ id: 'user-2', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);
      rankedSocketHub.handleConnection(bob.socket);

      rankedEvents.emitMatchCreated({
        matchId: 'm1',
        player1Id: 'user-1',
        player2Id: 'user-2',
      });

      await flush();
      expect(alice.lastOf('match:found')).toMatchObject({ match: { id: 'm1' } });
      expect(bob.lastOf('match:found')).toMatchObject({ match: { id: 'm1' } });
      expect(mockGetMatch).toHaveBeenCalledWith('m1', 'user-1');
      expect(mockGetMatch).toHaveBeenCalledWith('m1', 'user-2');
    });

    it('avisa o jogador que está na fila', async () => {
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      rankedEvents.emitQueued({
        userId: 'user-1',
        queueId: 'q1',
        rating: 1250,
        expiresAt: new Date(Date.now() + 5_000),
      });

      await flush();
      expect(alice.lastOf('queue:joining')).toMatchObject({
        queueId: 'q1',
        rating: 1250,
      });
    });

    it('confirma quando o jogador sai da fila', async () => {
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);

      rankedEvents.emitQueueLeft({ userId: 'user-1' });

      await flush();
      expect(alice.lastOf('queue:canceled')).toEqual({ status: 'left' });
    });

    it('atualiza o estado dos dois jogadores quando alguém responde', async () => {
      mockGetMatch.mockResolvedValue(activeState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      bob = createFakeSocket({ id: 'user-2', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);
      rankedSocketHub.handleConnection(bob.socket);

      rankedEvents.emitRoundAnswered({
        matchId: 'm1',
        roundNumber: 1,
        player1Id: 'user-1',
        player2Id: 'user-2',
      });

      await flush();
      expect(alice.lastOf('match:answered')).toMatchObject({
        match: { id: 'm1' },
      });
      expect(bob.lastOf('match:answered')).toMatchObject({
        match: { id: 'm1' },
      });
    });

    it('avisa o fim da partida quando a vida zera', async () => {
      mockGetMatch.mockResolvedValue(finishedState());
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      bob = createFakeSocket({ id: 'user-2', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);
      rankedSocketHub.handleConnection(bob.socket);

      rankedEvents.emitRoundResolved({
        matchId: 'm1',
        roundNumber: 2,
        finished: true,
        winnerId: 'user-1',
        player1Id: 'user-1',
        player2Id: 'user-2',
      });

      await flush();
      expect(alice.lastOf('match:finished')).toMatchObject({
        match: { status: 'FINISHED', winnerId: 'user-1' },
      });
      expect(bob.lastOf('match:finished')).toMatchObject({
        match: { status: 'FINISHED', winnerId: 'user-1' },
      });
    });
  });

  describe('getPresence', () => {
    it('retorna jogadores online e na fila', async () => {
      mockQueueCount.mockResolvedValue(5);
      alice = createFakeSocket({ id: 'user-1', role: 'USER' });
      bob = createFakeSocket({ id: 'user-2', role: 'USER' });
      rankedSocketHub.handleConnection(alice.socket);
      rankedSocketHub.handleConnection(bob.socket);

      const presence = await rankedSocketHub.getPresence();

      expect(presence).toEqual({ playersOnline: 2, playersInQueue: 5 });
    });
  });
});