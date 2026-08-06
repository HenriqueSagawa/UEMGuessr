import {
  ROUND_TIME_LIMIT_SECONDS,
  EARLY_ANSWER_WINDOW_SECONDS,
  ratingDelta,
} from '../ranked.lib';
import {
  getActiveSeason,
  joinRankedQueue,
  getRankedQueueStatus,
  leaveRankedQueue,
  getRankedMatch,
  submitRankedAnswer,
  getRankedProfile,
  getRankedLeaderboard,
  createSeason,
  endCurrentSeason,
  resolveRound,
} from '../ranked.service';
import { prisma } from '../../../config/prisma';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    season: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    rankedProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    rankedMatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rankedRound: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    rankedQueueEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    location: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockSeasonFindFirst = prisma.season.findFirst as jest.Mock;
const mockSeasonCreate = prisma.season.create as jest.Mock;
const mockSeasonUpdate = prisma.season.update as jest.Mock;
const mockSeasonCount = prisma.season.count as jest.Mock;
const mockProfileFindUnique = prisma.rankedProfile.findUnique as jest.Mock;
const mockProfileCreate = prisma.rankedProfile.create as jest.Mock;
const mockProfileUpdate = prisma.rankedProfile.update as jest.Mock;
const mockProfileFindMany = prisma.rankedProfile.findMany as jest.Mock;
const mockProfileCount = prisma.rankedProfile.count as jest.Mock;
const mockMatchCreate = prisma.rankedMatch.create as jest.Mock;
const mockMatchFindUnique = prisma.rankedMatch.findUnique as jest.Mock;
const mockMatchFindFirst = prisma.rankedMatch.findFirst as jest.Mock;
const mockMatchUpdate = prisma.rankedMatch.update as jest.Mock;
const mockMatchUpdateMany = prisma.rankedMatch.updateMany as jest.Mock;
const mockRoundFindUnique = prisma.rankedRound.findUnique as jest.Mock;
const mockRoundCreate = prisma.rankedRound.create as jest.Mock;
const mockRoundUpdate = prisma.rankedRound.update as jest.Mock;
const mockQueueFindMany = prisma.rankedQueueEntry.findMany as jest.Mock;
const mockQueueFindFirst = prisma.rankedQueueEntry.findFirst as jest.Mock;
const mockQueueCreate = prisma.rankedQueueEntry.create as jest.Mock;
const mockQueueUpdate = prisma.rankedQueueEntry.update as jest.Mock;
const mockQueueDeleteMany = prisma.rankedQueueEntry.deleteMany as jest.Mock;
const mockQueueDelete = prisma.rankedQueueEntry.delete as jest.Mock;
const mockLocationCount = prisma.location.count as jest.Mock;
const mockLocationFindFirst = prisma.location.findFirst as jest.Mock;
const mockLocationFindUnique = prisma.location.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const NOW = new Date('2026-08-06T12:00:00Z');
const ROUND_START = new Date(NOW.getTime() - 10_000);
const ROUND_DEADLINE = new Date(NOW.getTime() + 50_000);

const mockTx = {
  rankedRound: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  rankedMatch: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  rankedProfile: { findUnique: jest.fn(), update: jest.fn() },
  rankedQueueEntry: { updateMany: jest.fn(), update: jest.fn() },
  location: { count: jest.fn(), findFirst: jest.fn() },
};

const seasonRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'season-1',
  name: 'Temporada 1',
  status: 'ACTIVE',
  startsAt: new Date('2026-08-01T00:00:00Z'),
  endsAt: null,
  createdAt: NOW,
  ...overrides,
});

const profileRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-1',
  userId: 'user-1',
  seasonId: 'season-1',
  rating: 1200,
  division: 'PRATA_III',
  wins: 0,
  losses: 0,
  bestRating: 1200,
  createdAt: NOW,
  updateAt: NOW,
  ...overrides,
});

const queueEntryRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'queue-1',
  seasonId: 'season-1',
  userId: 'user-2',
  rating: 1250,
  status: 'WAITING',
  expiresAt: new Date(NOW.getTime() + 60_000),
  createdAt: NOW,
  matchedMatchId: null,
  ...overrides,
});

const roundRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'round-1',
  matchId: 'match-1',
  roundNumber: 1,
  locationId: 'loc-1',
  multiplier: 1,
  startedAt: ROUND_START,
  deadline: ROUND_DEADLINE,
  resolvedAt: null,
  player1GuessLatitude: null,
  player1GuessLongitude: null,
  player1Score: null,
  player1DistanceMeters: null,
  player1AnsweredAt: null,
  player1Damage: null,
  player2GuessLatitude: null,
  player2GuessLongitude: null,
  player2Score: null,
  player2DistanceMeters: null,
  player2AnsweredAt: null,
  player2Damage: null,
  location: { id: 'loc-1', imageUrl: 'http://img/loc-1.jpg' },
  ...overrides,
});

const matchRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'match-1',
  seasonId: 'season-1',
  status: 'IN_PROGRESS',
  player1Id: 'user-1',
  player2Id: 'user-2',
  player1Health: 5000,
  player2Health: 5000,
  roundMultiplier: 1,
  currentRoundNumber: 1,
  winnerId: null,
  player1RatingDelta: null,
  player2RatingDelta: null,
  startedAt: NOW,
  finishedAt: null,
  createdAt: NOW,
  player1: {
    id: 'user-1',
    username: 'alice',
    displayName: null,
    avatarUrl: null,
  },
  player2: {
    id: 'user-2',
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
  },
  rounds: [roundRecord()],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockTx.rankedRound.findUnique.mockReset();
  mockTx.rankedRound.create.mockReset();
  mockTx.rankedRound.update.mockReset();
  mockTx.rankedMatch.create.mockReset();
  mockTx.rankedMatch.findFirst.mockReset();
  mockTx.rankedMatch.update.mockReset();
  mockTx.rankedMatch.updateMany.mockReset();
  mockTx.rankedProfile.findUnique.mockReset();
  mockTx.rankedProfile.update.mockReset();
  mockTx.rankedQueueEntry.updateMany.mockReset();
  mockTx.rankedQueueEntry.update.mockReset();
  mockTx.location.count.mockReset();
  mockTx.location.findFirst.mockReset();
  mockTransaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: typeof mockTx) => unknown)(mockTx);
    return arg;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getActiveSeason', () => {
  it('retorna a temporada ativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());

    const season = await getActiveSeason();

    expect(season.id).toBe('season-1');
  });

  it('lança 409 quando não há temporada ativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(null);

    await expect(getActiveSeason()).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('joinRankedQueue', () => {
  it('lança 409 quando não há temporada ativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(null);

    await expect(joinRankedQueue('user-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('cria perfil e encontra o oponente com menor diferença de pontos', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(profileRecord());
    mockMatchFindFirst.mockResolvedValue(null);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindMany.mockResolvedValue([
      queueEntryRecord({ id: 'q1', userId: 'user-9', rating: 2000 }),
      queueEntryRecord({ id: 'q2', userId: 'user-2', rating: 1230 }),
    ]);
    mockTx.rankedQueueEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.rankedMatch.findFirst.mockResolvedValue(null);
    mockTx.location.count.mockResolvedValue(1);
    mockTx.location.findFirst.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockTx.rankedMatch.create.mockResolvedValue({ id: 'match-1' });
    mockTx.rankedQueueEntry.update.mockResolvedValue({});

    const result = await joinRankedQueue('user-1');

    expect(mockProfileFindUnique).toHaveBeenCalledWith({
      where: { userId_seasonId: { userId: 'user-1', seasonId: 'season-1' } },
    });
    expect(mockQueueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          seasonId: 'season-1',
          status: 'WAITING',
          expiresAt: { gt: expect.any(Date) },
        }),
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(mockTx.rankedQueueEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'q2', status: 'WAITING' },
      data: { status: 'MATCHED' },
    });
    expect(mockTx.rankedMatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          player1Id: 'user-2',
          player2Id: 'user-1',
          currentRoundNumber: 1,
        }),
      }),
    );
    expect(mockTx.rankedQueueEntry.update).toHaveBeenCalledWith({
      where: { id: 'q2' },
      data: { matchedMatchId: 'match-1' },
    });
    expect(result).toEqual({ status: 'matched', matchId: 'match-1' });
  });

  it('reusa a partida já criada pelo oponente em pedido concorrente', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(profileRecord());
    mockMatchFindFirst.mockResolvedValue(null);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindMany.mockResolvedValue([queueEntryRecord({ id: 'q2' })]);
    mockTx.rankedQueueEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.rankedMatch.findFirst.mockResolvedValue({ id: 'match-1' });

    const result = await joinRankedQueue('user-1');

    expect(mockTx.rankedMatch.create).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'matched', matchId: 'match-1' });
  });

  it('tenta novamente quando outro request já reservou o candidato', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(profileRecord());
    mockMatchFindFirst.mockResolvedValue(null);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindMany
      .mockResolvedValueOnce([queueEntryRecord({ id: 'q2' })])
      .mockResolvedValue([]);
    mockQueueCreate.mockResolvedValue(
      queueEntryRecord({ id: 'queue-1', userId: 'user-1' }),
    );
    mockTx.rankedQueueEntry.updateMany.mockResolvedValue({ count: 0 });

    const result = await joinRankedQueue('user-1');

    expect(mockTx.rankedQueueEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'q2', status: 'WAITING' },
      data: { status: 'MATCHED' },
    });
    expect(mockTx.rankedMatch.create).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'queued', queueId: 'queue-1' });
  });

  it('entra na fila quando não há oponente', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(profileRecord());
    mockMatchFindFirst.mockResolvedValue(null);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindMany.mockResolvedValue([]);
    mockQueueCreate.mockResolvedValue(
      queueEntryRecord({ id: 'queue-1', userId: 'user-1' }),
    );

    const result = await joinRankedQueue('user-1');

    expect(mockQueueFindMany).toHaveBeenCalledTimes(2);
    expect(mockQueueCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          seasonId: 'season-1',
          userId: 'user-1',
          rating: 1200,
        }),
      }),
    );
    expect(result).toEqual({ status: 'queued', queueId: 'queue-1' });
  });

  it('fecha a corrida pareando na segunda tentativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(profileRecord());
    mockMatchFindFirst.mockResolvedValue(null);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([queueEntryRecord()]);
    mockQueueCreate.mockResolvedValue(
      queueEntryRecord({ id: 'queue-1', userId: 'user-1' }),
    );
    mockTx.rankedQueueEntry.updateMany.mockResolvedValue({ count: 1 });
    mockTx.rankedMatch.findFirst.mockResolvedValue(null);
    mockTx.location.count.mockResolvedValue(1);
    mockTx.location.findFirst.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockTx.rankedMatch.create.mockResolvedValue({ id: 'match-1' });
    mockTx.rankedQueueEntry.update.mockResolvedValue({});
    mockQueueUpdate.mockResolvedValue({});

    const result = await joinRankedQueue('user-1');

    expect(result).toEqual({ status: 'matched', matchId: 'match-1' });
    expect(mockQueueUpdate).toHaveBeenCalledWith({
      where: { id: 'queue-1' },
      data: { status: 'MATCHED', matchedMatchId: 'match-1' },
    });
  });
});

describe('getRankedQueueStatus', () => {
  it('retorna matched quando o usuário foi pareado', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindFirst.mockResolvedValue({
      ...queueEntryRecord(),
      status: 'MATCHED',
      matchedMatchId: 'match-1',
    });

    const result = await getRankedQueueStatus('user-2');

    expect(result).toEqual({ status: 'matched', matchId: 'match-1' });
  });

  it('retorna queued quando ainda esperando', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(queueEntryRecord());

    const result = await getRankedQueueStatus('user-2');

    expect(result).toMatchObject({
      status: 'queued',
      queueId: 'queue-1',
      rating: 1250,
    });
  });

  it('retorna not_queued quando não há registro', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockQueueFindFirst.mockResolvedValue(null);

    const result = await getRankedQueueStatus('user-2');

    expect(result).toEqual({ status: 'not_queued' });
  });
});

describe('leaveRankedQueue', () => {
  it('remove a entrada da fila', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockQueueDeleteMany.mockResolvedValue({ count: 1 });

    const result = await leaveRankedQueue('user-1');

    expect(mockQueueDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', seasonId: 'season-1', status: 'WAITING' },
    });
    expect(result).toEqual({ status: 'left' });
  });
});

describe('getRankedMatch', () => {
  it('lança 404 quando a partida não existe', async () => {
    mockMatchFindUnique.mockResolvedValue(null);

    await expect(getRankedMatch('match-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança 404 quando o usuário não participa da partida', async () => {
    mockMatchFindUnique.mockResolvedValue(
      matchRecord({ player1Id: 'user-x', player2Id: 'user-y' }),
    );

    await expect(getRankedMatch('match-1', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('retorna o estado da partida sem resolver rodada em andamento', async () => {
    mockMatchFindUnique.mockResolvedValue(matchRecord());

    const result = await getRankedMatch('match-1', 'user-1');

    expect(result.match).toMatchObject({
      id: 'match-1',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      multiplier: 1,
      myHealth: 5000,
      opponentHealth: 5000,
    });
    expect(result.opponent).toMatchObject({ username: 'bob' });
    expect(result.currentRound).toMatchObject({
      roundNumber: 1,
      timeRemainingSeconds: 50,
      myAnswered: false,
      opponentAnswered: false,
    });
    expect(result.lastResult).toBeNull();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('submitRankedAnswer', () => {
  const input = { guessLatitude: 0.001, guessLongitude: 0 };

  it('lança 404 quando a partida não existe', async () => {
    mockMatchFindUnique.mockResolvedValue(null);

    await expect(
      submitRankedAnswer('match-1', 'user-1', 1, input),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança 409 quando a partida já foi encerrada', async () => {
    mockMatchFindUnique.mockResolvedValue(
      matchRecord({ status: 'FINISHED', winnerId: 'user-2' }),
    );

    await expect(
      submitRankedAnswer('match-1', 'user-1', 1, input),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('lança 410 quando o tempo da rodada esgotou', async () => {
    mockMatchFindUnique.mockResolvedValue(
      matchRecord({
        rounds: [roundRecord({ deadline: new Date(NOW.getTime() - 1000) })],
      }),
    );
    mockTx.rankedRound.findUnique.mockResolvedValue(null);

    await expect(
      submitRankedAnswer('match-1', 'user-1', 1, input),
    ).rejects.toMatchObject({
      statusCode: 410,
      message: 'O tempo da rodada esgotou.',
    });
  });

  it('lança 409 quando o jogador já respondeu a rodada', async () => {
    mockMatchFindUnique.mockResolvedValue(
      matchRecord({
        rounds: [roundRecord({ player1AnsweredAt: NOW, player1Score: 800 })],
      }),
    );

    await expect(
      submitRankedAnswer('match-1', 'user-1', 1, input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Você já respondeu esta rodada.',
    });
  });

  it('lança 409 quando não é a rodada atual', async () => {
    mockMatchFindUnique.mockResolvedValue(
      matchRecord({ currentRoundNumber: 2, rounds: [roundRecord()] }),
    );

    await expect(
      submitRankedAnswer('match-1', 'user-1', 1, input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Esta não é a rodada atual da partida.',
    });
  });

  it('registra a resposta e encurta o prazo quando responde antes dos últimos 15s', async () => {
    mockMatchFindUnique.mockResolvedValueOnce(matchRecord()).mockResolvedValue(
      matchRecord({
        rounds: [roundRecord({ player1AnsweredAt: NOW, player1Score: 691 })],
      }),
    );
    mockLocationFindUnique.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockRoundUpdate.mockResolvedValue(roundRecord({ player1AnsweredAt: NOW }));

    const result = await submitRankedAnswer('match-1', 'user-1', 1, input);

    const expectedDeadline = new Date(
      NOW.getTime() + EARLY_ANSWER_WINDOW_SECONDS * 1000,
    );
    expect(mockRoundUpdate).toHaveBeenCalledWith({
      where: { id: 'round-1' },
      data: expect.objectContaining({
        player1Score: expect.any(Number),
        deadline: expectedDeadline,
      }),
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(result.currentRound.myAnswered).toBe(true);
  });

  it('não altera o prazo quando responde nos últimos 15 segundos', async () => {
    const lateStart = new Date(NOW.getTime() - 50_000);
    mockMatchFindUnique
      .mockResolvedValueOnce(
        matchRecord({
          rounds: [
            roundRecord({
              startedAt: lateStart,
              deadline: new Date(NOW.getTime() + 10_000),
            }),
          ],
        }),
      )
      .mockResolvedValue(
        matchRecord({
          rounds: [
            roundRecord({
              startedAt: lateStart,
              deadline: new Date(NOW.getTime() + 10_000),
              player1AnsweredAt: NOW,
            }),
          ],
        }),
      );
    mockLocationFindUnique.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockRoundUpdate.mockResolvedValue(roundRecord({ player1AnsweredAt: NOW }));

    await submitRankedAnswer('match-1', 'user-1', 1, input);

    const updateCall = mockRoundUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).not.toHaveProperty('deadline');
  });

  it('resolver a rodada e cria a próxima quando ambos respondem', async () => {
    mockMatchFindUnique
      .mockResolvedValueOnce(
        matchRecord({
          rounds: [roundRecord({ player2AnsweredAt: NOW, player2Score: 100 })],
        }),
      )
      .mockResolvedValue(
        matchRecord({
          roundMultiplier: 1.5,
          currentRoundNumber: 2,
          player2Health: 4100,
          rounds: [
            roundRecord({
              resolvedAt: NOW,
              player1Score: 1000,
              player2Score: 100,
              player1Damage: 900,
              player2Damage: 0,
            }),
            roundRecord({
              id: 'round-2',
              roundNumber: 2,
              multiplier: 1.5,
              location: { id: 'loc-2', imageUrl: 'http://img/loc-2.jpg' },
              startedAt: NOW,
              deadline: new Date(
                NOW.getTime() + ROUND_TIME_LIMIT_SECONDS * 1000,
              ),
            }),
          ],
        }),
      );
    mockLocationFindUnique.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockRoundUpdate.mockResolvedValue(roundRecord());

    mockTx.rankedRound.findUnique.mockResolvedValue({
      ...roundRecord(),
      player1AnsweredAt: NOW,
      player1Score: 1000,
      player2AnsweredAt: NOW,
      player2Score: 100,
      match: {
        id: 'match-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        player1Id: 'user-1',
        player2Id: 'user-2',
        player1Health: 5000,
        player2Health: 5000,
      },
    });
    mockTx.rankedRound.update.mockResolvedValue({});
    mockTx.location.count.mockResolvedValue(1);
    mockTx.location.findFirst.mockResolvedValue({
      id: 'loc-2',
      latitude: 1,
      longitude: 1,
    });
    mockTx.rankedMatch.update.mockResolvedValue({});
    mockTx.rankedRound.create.mockResolvedValue({});

    const result = await submitRankedAnswer('match-1', 'user-1', 1, {
      guessLatitude: 0,
      guessLongitude: 0,
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    const nextRoundUpdate = mockTx.rankedMatch.update.mock.calls[0]?.[0] as {
      data: {
        player2Health: number;
        currentRoundNumber: number;
        roundMultiplier: number;
      };
    };
    expect(nextRoundUpdate.data).toMatchObject({
      player1Health: 5000,
      player2Health: 4100,
      currentRoundNumber: 2,
      roundMultiplier: 1.5,
    });
    expect(result.match).toMatchObject({
      roundNumber: 2,
      multiplier: 1.5,
      opponentHealth: 4100,
    });
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({
      roundNumber: 1,
      myScore: 1000,
      opponentScore: 100,
      myDamage: 900,
    });
  });

  it('encerra a partida e aplica a pontuação quando a vida zera', async () => {
    mockMatchFindUnique
      .mockResolvedValueOnce(
        matchRecord({
          player2Health: 500,
          currentRoundNumber: 2,
          rounds: [
            roundRecord({
              id: 'round-2',
              roundNumber: 2,
              multiplier: 1.5,
              startedAt: NOW,
              deadline: new Date(NOW.getTime() + 50_000),
              player2AnsweredAt: NOW,
              player2Score: 100,
            }),
          ],
        }),
      )
      .mockResolvedValue(
        matchRecord({
          status: 'FINISHED',
          winnerId: 'user-1',
          player2Health: 0,
          finishedAt: NOW,
          rounds: [
            roundRecord({
              id: 'round-2',
              roundNumber: 2,
              multiplier: 1.5,
              resolvedAt: NOW,
              player1Score: 691,
              player2Score: 100,
              player1Damage: 900,
              player2Damage: 0,
            }),
          ],
        }),
      );
    mockLocationFindUnique.mockResolvedValue({
      id: 'loc-1',
      latitude: 0,
      longitude: 0,
    });
    mockRoundUpdate.mockResolvedValue({});

    mockTx.rankedRound.findUnique.mockResolvedValue({
      ...roundRecord({
        id: 'round-2',
        roundNumber: 2,
        multiplier: 1.5,
      }),
      player1AnsweredAt: NOW,
      player1Score: 691,
      player2AnsweredAt: NOW,
      player2Score: 100,
      match: {
        id: 'match-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        player1Id: 'user-1',
        player2Id: 'user-2',
        player1Health: 5000,
        player2Health: 500,
      },
    });
    mockTx.rankedRound.update.mockResolvedValue({});
    mockTx.rankedMatch.update.mockResolvedValue({});
    mockTx.rankedProfile.findUnique
      .mockResolvedValueOnce(profileRecord())
      .mockResolvedValueOnce(
        profileRecord({ id: 'profile-2', userId: 'user-2' }),
      )
      .mockResolvedValueOnce(profileRecord())
      .mockResolvedValueOnce(
        profileRecord({ id: 'profile-2', userId: 'user-2' }),
      );
    mockTx.rankedProfile.update.mockResolvedValue({});

    const result = await submitRankedAnswer('match-1', 'user-1', 2, input);

    expect(result.match.status).toBe('FINISHED');
    expect(result.match.winnerId).toBe('user-1');
    expect(result.match.opponentHealth).toBe(0);

    const finishUpdate = mockTx.rankedMatch.update.mock.calls[0]?.[0] as {
      data: {
        status: string;
        winnerId: string;
        player1RatingDelta: number;
        player2RatingDelta: number;
      };
    };
    expect(finishUpdate.data).toMatchObject({
      status: 'FINISHED',
      winnerId: 'user-1',
      player1RatingDelta: ratingDelta(1200, 1200, 1),
      player2RatingDelta: ratingDelta(1200, 1200, 0),
    });

    const winnerUpdate = mockTx.rankedProfile.update.mock.calls[0]?.[0] as {
      data: { rating: number; wins: { increment: number } };
    };
    expect(winnerUpdate.data).toMatchObject({
      rating: 1200 + ratingDelta(1200, 1200, 1),
      wins: { increment: 1 },
    });
  });

  it('marca a partida como abandonada quando ninguém responde a rodada', async () => {
    mockTx.rankedRound.findUnique.mockResolvedValue({
      ...roundRecord({ deadline: new Date(NOW.getTime() - 1000) }),
      match: {
        id: 'match-1',
        seasonId: 'season-1',
        status: 'IN_PROGRESS',
        player1Id: 'user-1',
        player2Id: 'user-2',
        player1Health: 5000,
        player2Health: 5000,
      },
    });
    mockTx.rankedRound.update.mockResolvedValue({});
    mockTx.rankedMatch.update.mockResolvedValue({});

    const result = await resolveRound('match-1', 1, NOW);

    expect(mockTx.rankedRound.update).toHaveBeenCalledWith({
      where: { id: 'round-1' },
      data: expect.objectContaining({ resolvedAt: NOW }),
    });
    const abandonUpdate = mockTx.rankedMatch.update.mock.calls[0]?.[0] as {
      data: { status: string; finishedAt: Date };
    };
    expect(abandonUpdate.data).toMatchObject({
      status: 'ABANDONED',
      finishedAt: NOW,
    });
    expect(mockTx.rankedProfile.update).not.toHaveBeenCalled();
    expect(result).toEqual({ finished: true, winnerId: null, roundNumber: 1 });
  });
});

describe('getRankedProfile', () => {
  it('retorna a temporada ativa e o perfil do usuário', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindUnique.mockResolvedValue(
      profileRecord({ rating: 1350, wins: 2 }),
    );

    const result = await getRankedProfile('user-1');

    expect(result.season).toMatchObject({
      id: 'season-1',
      name: 'Temporada 1',
    });
    expect(result.profile).toMatchObject({
      rating: 1350,
      division: 'PRATA_III',
      divisionLabel: 'Prata III',
      wins: 2,
    });
  });
});

describe('getRankedLeaderboard', () => {
  it('retorna o top e a posição do usuário', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockProfileFindMany.mockResolvedValue([
      {
        ...profileRecord({
          id: 'p1',
          userId: 'user-a',
          rating: 1800,
          wins: 5,
          division: 'PRATA_II',
        }),
        user: {
          id: 'user-a',
          username: 'alice',
          displayName: null,
          avatarUrl: null,
        },
      },
    ]);
    mockProfileFindUnique.mockResolvedValue(profileRecord({ rating: 1350 }));
    mockProfileCount.mockResolvedValue(1);

    const result = await getRankedLeaderboard('user-1', 20);

    expect(result.top[0]).toMatchObject({
      rank: 1,
      username: 'alice',
      rating: 1800,
      divisionLabel: 'Prata II',
    });
    expect(result.user).toMatchObject({ rank: 2, rating: 1350 });
    expect(mockProfileCount).toHaveBeenCalledWith({
      where: { seasonId: 'season-1', rating: { gt: 1350 } },
    });
  });
});

describe('createSeason / endCurrentSeason', () => {
  it('cria a primeira temporada quando não há ativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(null);
    mockSeasonCount.mockResolvedValue(0);
    mockSeasonCreate.mockResolvedValue(
      seasonRecord({ id: 'season-2', name: 'Temporada 1' }),
    );

    const season = await createSeason({});

    expect(mockSeasonCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Temporada 1', status: 'ACTIVE' }),
    });
    expect(season.name).toBe('Temporada 1');
  });

  it('encerra a temporada ativa, abandona partidas e cria a nova (reset)', async () => {
    mockSeasonFindFirst.mockResolvedValue(seasonRecord());
    mockSeasonUpdate.mockResolvedValue({});
    mockMatchUpdateMany.mockResolvedValue({ count: 2 });
    mockSeasonCount.mockResolvedValue(1);
    mockSeasonCreate.mockResolvedValue(
      seasonRecord({ id: 'season-2', name: 'Temporada 2' }),
    );

    await createSeason({});

    expect(mockSeasonUpdate).toHaveBeenCalledWith({
      where: { id: 'season-1' },
      data: expect.objectContaining({ status: 'ENDED' }),
    });
    expect(mockMatchUpdateMany).toHaveBeenCalledWith({
      where: { seasonId: 'season-1', status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', finishedAt: expect.any(Date) },
    });
    expect(mockSeasonCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Temporada 2' }),
    });
  });

  it('lança 409 ao encerrar quando não há temporada ativa', async () => {
    mockSeasonFindFirst.mockResolvedValue(null);

    await expect(endCurrentSeason()).rejects.toMatchObject({ statusCode: 409 });
  });
});
