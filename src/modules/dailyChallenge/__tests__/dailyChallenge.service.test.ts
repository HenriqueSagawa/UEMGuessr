import {
  CHALLENGE_WINDOW_MS,
  DEFAULT_TIME_LIMIT_SECONDS,
  ensureActiveChallenge,
  getCurrentDailyChallenge,
  startDailyChallenge,
  submitDailyChallengeGuess,
  getDailyChallengeLeaderboard,
} from '../dailyChallenge.service';
import { prisma } from '../../../config/prisma';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    dailyChallenge: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    dailyChallengeAttempt: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    location: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const mockChallengeFindUnique = prisma.dailyChallenge.findUnique as jest.Mock;
const mockChallengeFindMany = prisma.dailyChallenge.findMany as jest.Mock;
const mockChallengeCreate = prisma.dailyChallenge.create as jest.Mock;
const mockAttemptFindUnique = prisma.dailyChallengeAttempt
  .findUnique as jest.Mock;
const mockAttemptFindMany = prisma.dailyChallengeAttempt.findMany as jest.Mock;
const mockAttemptCount = prisma.dailyChallengeAttempt.count as jest.Mock;
const mockAttemptCreate = prisma.dailyChallengeAttempt.create as jest.Mock;
const mockAttemptUpdate = prisma.dailyChallengeAttempt.update as jest.Mock;
const mockLocationCount = prisma.location.count as jest.Mock;
const mockLocationFindFirst = prisma.location.findFirst as jest.Mock;

const NOW = new Date('2026-08-06T12:00:00Z');
const TODAY = new Date('2026-08-06T00:00:00Z');
const TOMORROW = new Date('2026-08-07T00:00:00Z');

const locationRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'loc-1',
  name: 'BCE',
  description: null,
  latitude: 0,
  longitude: 0,
  imageUrl: 'http://img/loc-1.jpg',
  imagePublicId: null,
  createdById: null,
  createdAt: NOW,
  rounds: [],
  dailyChallenges: [],
  ...overrides,
});

const challengeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'challenge-1',
  challengeDate: TODAY,
  startsAt: TODAY,
  endsAt: TOMORROW,
  timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
  locationId: 'loc-1',
  createdAt: TODAY,
  location: locationRecord(),
  ...overrides,
});

const attemptRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  challengeId: 'challenge-1',
  userId: 'user-1',
  guessLatitude: 0.001,
  guessLongitude: 0,
  distanceMeters: 111.2,
  score: 691,
  startedAt: TODAY,
  submittedAt: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ensureActiveChallenge', () => {
  it('retorna o desafio existente do dia', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());

    const challenge = await ensureActiveChallenge();

    expect(mockChallengeFindUnique).toHaveBeenCalledWith({
      where: { challengeDate: TODAY },
      include: { location: true },
    });
    expect(challenge.id).toBe('challenge-1');
  });

  it('cria um novo desafio com um local aleatório quando não existe', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);
    mockChallengeFindMany.mockResolvedValue([]);
    mockLocationCount.mockResolvedValue(3);
    mockLocationFindFirst.mockResolvedValue(locationRecord());
    mockChallengeCreate.mockResolvedValue(challengeRecord());
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const challenge = await ensureActiveChallenge();

    expect(mockChallengeFindMany).toHaveBeenCalledWith({
      where: {
        challengeDate: {
          gte: new Date(TODAY.getTime() - 7 * CHALLENGE_WINDOW_MS),
        },
      },
      select: { locationId: true },
    });
    expect(mockLocationFindFirst).toHaveBeenCalledWith({ where: {}, skip: 0 });
    expect(mockChallengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        challengeDate: TODAY,
        startsAt: TODAY,
        endsAt: TOMORROW,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        locationId: 'loc-1',
      }),
      include: { location: true },
    });
    expect(challenge.id).toBe('challenge-1');
  });

  it('evita repetir local usado nos últimos dias', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);
    mockChallengeFindMany.mockResolvedValue([
      { locationId: 'loc-used' },
      { locationId: 'loc-used-2' },
    ]);
    mockLocationCount.mockResolvedValue(5);
    mockLocationFindFirst.mockResolvedValue(locationRecord());
    mockChallengeCreate.mockResolvedValue(challengeRecord());

    await ensureActiveChallenge();

    expect(mockLocationCount).toHaveBeenCalledWith({
      where: { id: { notIn: ['loc-used', 'loc-used-2'] } },
    });
  });

  it('lança 503 quando não há locais disponíveis', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);
    mockChallengeFindMany.mockResolvedValue([]);
    mockLocationCount.mockResolvedValue(0);

    await expect(ensureActiveChallenge()).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('reutiliza o desafio criado por outro processo na corrida (P2002)', async () => {
    mockChallengeFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(challengeRecord());
    mockChallengeFindMany.mockResolvedValue([]);
    mockLocationCount.mockResolvedValue(1);
    mockLocationFindFirst.mockResolvedValue(locationRecord());
    mockChallengeCreate.mockRejectedValue({ code: 'P2002' });

    const challenge = await ensureActiveChallenge();

    expect(mockChallengeFindUnique).toHaveBeenCalledTimes(2);
    expect(challenge.id).toBe('challenge-1');
  });
});

describe('getCurrentDailyChallenge', () => {
  it('retorna status not_started quando o usuário ainda não começou', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(null);

    const result = await getCurrentDailyChallenge('user-1');

    expect(result.status.state).toBe('not_started');
    expect(result.location).toEqual({
      id: 'loc-1',
      name: 'BCE',
      imageUrl: 'http://img/loc-1.jpg',
    });
    expect(result.windowRemainingSeconds).toBe(12 * 60 * 60);
  });

  it('retorna status in_progress com o tempo restante', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({ startedAt: new Date(NOW.getTime() - 10_000) }),
    );

    const result = await getCurrentDailyChallenge('user-1');

    expect(result.status).toMatchObject({
      state: 'in_progress',
      attemptId: 'attempt-1',
      remainingSeconds: DEFAULT_TIME_LIMIT_SECONDS - 10,
    });
  });

  it('retorna status submitted com o resultado', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({ submittedAt: new Date(NOW.getTime() - 5_000) }),
    );

    const result = await getCurrentDailyChallenge('user-1');

    expect(result.status.state).toBe('submitted');
    expect(result.status.score).toBe(691);
    expect(result.status.correct).toEqual({ latitude: 0, longitude: 0 });
  });
});

describe('startDailyChallenge', () => {
  it('lança 404 se o desafio não existe', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);

    await expect(
      startDailyChallenge('challenge-1', 'user-1'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança 409 se o desafio já encerrou', async () => {
    mockChallengeFindUnique.mockResolvedValue(
      challengeRecord({ endsAt: new Date(NOW.getTime() - 1000) }),
    );

    await expect(
      startDailyChallenge('challenge-1', 'user-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'O desafio diário já foi encerrado.',
    });
  });

  it('lança 409 se o usuário já participou', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({ submittedAt: new Date(NOW.getTime() - 5_000) }),
    );

    await expect(
      startDailyChallenge('challenge-1', 'user-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Você já participou do desafio diário de hoje.',
    });
  });

  it('não reinicia o cronômetro se já está em andamento', async () => {
    const inProgress = attemptRecord({
      startedAt: new Date(NOW.getTime() - 20_000),
      submittedAt: null,
    });
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(inProgress);

    const result = await startDailyChallenge('challenge-1', 'user-1');

    expect(mockAttemptCreate).not.toHaveBeenCalled();
    expect(result.attemptId).toBe('attempt-1');
    expect(result.remainingSeconds).toBe(DEFAULT_TIME_LIMIT_SECONDS - 20);
  });

  it('cria a tentativa e retorna o tempo disponível', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(null);
    mockAttemptCreate.mockResolvedValue(attemptRecord({ startedAt: NOW }));

    const result = await startDailyChallenge('challenge-1', 'user-1');

    expect(mockAttemptCreate).toHaveBeenCalledWith({
      data: { challengeId: 'challenge-1', userId: 'user-1' },
    });
    expect(result.attemptId).toBe('attempt-1');
    expect(result.timeLimitSeconds).toBe(DEFAULT_TIME_LIMIT_SECONDS);
    expect(result.remainingSeconds).toBe(DEFAULT_TIME_LIMIT_SECONDS);
  });
});

describe('submitDailyChallengeGuess', () => {
  const input = { guessLatitude: 0.001, guessLongitude: 0 };

  it('lança 404 se o desafio não existe', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);

    await expect(
      submitDailyChallengeGuess('challenge-1', 'user-1', input),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança 409 se o desafio já encerrou', async () => {
    mockChallengeFindUnique.mockResolvedValue(
      challengeRecord({ endsAt: new Date(NOW.getTime() - 1000) }),
    );

    await expect(
      submitDailyChallengeGuess('challenge-1', 'user-1', input),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('lança 400 se o usuário não iniciou o desafio', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(null);

    await expect(
      submitDailyChallengeGuess('challenge-1', 'user-1', input),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Inicie o desafio diário antes de enviar seu palpite.',
    });
  });

  it('lança 409 se o palpite já foi enviado', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({ submittedAt: new Date(NOW.getTime() - 5_000) }),
    );

    await expect(
      submitDailyChallengeGuess('challenge-1', 'user-1', input),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Você já enviou seu palpite no desafio diário de hoje.',
    });
  });

  it('lança 410 se o tempo para responder esgotou', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({
        startedAt: new Date(
          NOW.getTime() - (DEFAULT_TIME_LIMIT_SECONDS + 1) * 1000,
        ),
      }),
    );

    await expect(
      submitDailyChallengeGuess('challenge-1', 'user-1', input),
    ).rejects.toMatchObject({
      statusCode: 410,
      message: 'Tempo esgotado para responder ao desafio diário.',
    });
  });

  it('calcula distância, pontuação e registra o palpite', async () => {
    mockChallengeFindUnique.mockResolvedValue(challengeRecord());
    mockAttemptFindUnique.mockResolvedValue(attemptRecord({ startedAt: NOW }));
    mockAttemptUpdate.mockResolvedValue(
      attemptRecord({ submittedAt: NOW, score: 691, distanceMeters: 111.2 }),
    );

    const result = await submitDailyChallengeGuess(
      'challenge-1',
      'user-1',
      input,
    );

    expect(mockAttemptUpdate).toHaveBeenCalledWith({
      where: { id: 'attempt-1' },
      data: expect.objectContaining({
        guessLatitude: 0.001,
        guessLongitude: 0,
        score: expect.any(Number),
        submittedAt: expect.any(Date),
      }),
    });
    expect(result.score).toBe(691);
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.correct).toEqual({ latitude: 0, longitude: 0 });
  });
});

describe('getDailyChallengeLeaderboard', () => {
  it('lança 404 se o desafio não existe', async () => {
    mockChallengeFindUnique.mockResolvedValue(null);

    await expect(
      getDailyChallengeLeaderboard('challenge-1', 'user-1', 10),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('retorna o ranking ordenado por pontuação', async () => {
    mockChallengeFindUnique.mockResolvedValue({
      id: 'challenge-1',
      endsAt: TOMORROW,
    });
    mockAttemptFindMany.mockResolvedValue([
      {
        id: 'a1',
        challengeId: 'challenge-1',
        userId: 'user-a',
        guessLatitude: 0,
        guessLongitude: 0,
        distanceMeters: 5,
        score: 980,
        startedAt: NOW,
        submittedAt: new Date('2026-08-06T00:00:10Z'),
        user: {
          id: 'user-a',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
        },
      },
      {
        id: 'a2',
        challengeId: 'challenge-1',
        userId: 'user-b',
        guessLatitude: 0,
        guessLongitude: 0,
        distanceMeters: 300,
        score: 368,
        startedAt: NOW,
        submittedAt: new Date('2026-08-06T00:01:00Z'),
        user: {
          id: 'user-b',
          username: 'bob',
          displayName: null,
          avatarUrl: 'http://img/bob.jpg',
        },
      },
    ]);
    mockAttemptFindUnique.mockResolvedValue(
      attemptRecord({
        userId: 'user-b',
        score: 368,
        submittedAt: new Date('2026-08-06T00:01:00Z'),
      }),
    );
    mockAttemptCount.mockResolvedValue(1);

    const result = await getDailyChallengeLeaderboard(
      'challenge-1',
      'user-b',
      10,
    );

    expect(mockAttemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { challengeId: 'challenge-1', submittedAt: { not: null } },
        orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
        take: 10,
      }),
    );
    expect(result.top).toHaveLength(2);
    expect(result.top[0]).toMatchObject({
      rank: 1,
      userId: 'user-a',
      score: 980,
    });
    expect(result.top[1]).toMatchObject({
      rank: 2,
      userId: 'user-b',
      score: 368,
    });
    expect(result.user).toMatchObject({ rank: 2, score: 368 });
    expect(mockAttemptCount).toHaveBeenCalledWith({
      where: {
        challengeId: 'challenge-1',
        submittedAt: { not: null },
        score: { gt: 368 },
      },
    });
  });

  it('retorna user null quando o usuário não participou', async () => {
    mockChallengeFindUnique.mockResolvedValue({
      id: 'challenge-1',
      endsAt: TOMORROW,
    });
    mockAttemptFindMany.mockResolvedValue([]);
    mockAttemptFindUnique.mockResolvedValue(null);

    const result = await getDailyChallengeLeaderboard(
      'challenge-1',
      'user-1',
      10,
    );

    expect(result.top).toEqual([]);
    expect(result.user).toBeNull();
  });
});
