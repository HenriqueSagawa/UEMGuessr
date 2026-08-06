import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';
import { resolveRound } from '../../modules/ranked/ranked.service';
import { runRankedCleanup } from '../rankedCleanup';

jest.mock('../../config/prisma', () => ({
  prisma: {
    rankedMatch: { findMany: jest.fn() },
    rankedQueueEntry: { deleteMany: jest.fn() },
  },
}));

jest.mock('../../modules/ranked/ranked.service', () => ({
  resolveRound: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockMatchFindMany = prisma.rankedMatch.findMany as jest.Mock;
const mockQueueDeleteMany = prisma.rankedQueueEntry.deleteMany as jest.Mock;
const mockResolveRound = resolveRound as jest.Mock;
const mockLoggerError = logger.error as jest.Mock;

const NOW = new Date('2026-08-06T12:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('runRankedCleanup', () => {
  it('resolve as rodadas expiradas das partidas em andamento', async () => {
    mockMatchFindMany.mockResolvedValue([
      {
        id: 'match-1',
        rounds: [{ roundNumber: 2, deadline: new Date(NOW.getTime() - 1000) }],
      },
      {
        id: 'match-2',
        rounds: [{ roundNumber: 1, deadline: new Date(NOW.getTime() + 5000) }],
      },
    ]);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });

    await runRankedCleanup();

    expect(mockMatchFindMany).toHaveBeenCalledWith({
      where: { status: 'IN_PROGRESS' },
      select: {
        id: true,
        rounds: {
          where: { resolvedAt: null },
          orderBy: { roundNumber: 'desc' },
          take: 1,
        },
      },
    });
    expect(mockResolveRound).toHaveBeenCalledTimes(1);
    expect(mockResolveRound).toHaveBeenCalledWith('match-1', 2, NOW);
  });

  it('remove as entradas de fila ranqueada expiradas', async () => {
    mockMatchFindMany.mockResolvedValue([]);
    mockQueueDeleteMany.mockResolvedValue({ count: 3 });

    await runRankedCleanup();

    expect(mockQueueDeleteMany).toHaveBeenCalledWith({
      where: { status: 'WAITING', expiresAt: { lt: NOW } },
    });
  });

  it('não interrompe a limpeza quando uma rodada falha ao resolver', async () => {
    mockMatchFindMany.mockResolvedValue([
      {
        id: 'match-1',
        rounds: [{ roundNumber: 1, deadline: new Date(NOW.getTime() - 1000) }],
      },
      {
        id: 'match-2',
        rounds: [{ roundNumber: 3, deadline: new Date(NOW.getTime() - 2000) }],
      },
    ]);
    mockQueueDeleteMany.mockResolvedValue({ count: 0 });
    mockResolveRound
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});

    await expect(runRankedCleanup()).resolves.toBeUndefined();

    expect(mockResolveRound).toHaveBeenCalledTimes(2);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
