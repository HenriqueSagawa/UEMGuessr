import { TOTAL_ROUNDS_PER_GAME, createGame, listGames, getGameById, getNextRound, submitGuess, finishGame } from "../games.service";
import { prisma } from "../../../config/prisma";

jest.mock("../../../config/prisma", () => ({
  prisma: {
    game: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    round: {
      count: jest.fn(),
      create: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockGameCreate = prisma.game.create as jest.Mock;
const mockGameFindUnique = prisma.game.findUnique as jest.Mock;
const mockGameFindUniqueOrThrow = prisma.game.findUniqueOrThrow as jest.Mock;
const mockGameFindMany = prisma.game.findMany as jest.Mock;
const mockGameCount = prisma.game.count as jest.Mock;
const mockGameUpdate = prisma.game.update as jest.Mock;
const mockRoundCount = prisma.round.count as jest.Mock;
const mockRoundCreate = prisma.round.create as jest.Mock;
const mockLocationFindUnique = prisma.location.findUnique as jest.Mock;
const mockLocationFindMany = prisma.location.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const gameRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "game-1",
  userId: "user-1",
  score: 0,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  finishedAt: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGameCreate.mockReset();
  mockGameFindUnique.mockReset();
  mockGameFindUniqueOrThrow.mockReset();
  mockGameFindMany.mockReset();
  mockGameCount.mockReset();
  mockGameUpdate.mockReset();
  mockRoundCount.mockReset();
  mockRoundCreate.mockReset();
  mockLocationFindUnique.mockReset();
  mockLocationFindMany.mockReset();
  mockTransaction.mockReset();
  jest.restoreAllMocks();
});

describe("createGame", () => {
  it("cria uma partida para o usuário", async () => {
    mockGameCreate.mockResolvedValue(gameRecord());

    const result = await createGame("user-1");

    expect(mockGameCreate).toHaveBeenCalledWith({ data: { userId: "user-1" } });
    expect(result.id).toBe("game-1");
  });
});

describe("listGames", () => {
  it("retorna itens mapeados e paginação", async () => {
    mockTransaction.mockResolvedValue([
      [{ id: "g1", score: 100, startedAt: new Date(), finishedAt: null, _count: { rounds: 2 } }],
      1,
    ]);

    const result = await listGames("user-1", { page: 1, limit: 20 });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(result.items[0]).toEqual({
      id: "g1",
      score: 100,
      startedAt: expect.any(Date),
      finishedAt: null,
      roundsPlayed: 2,
      totalRounds: TOTAL_ROUNDS_PER_GAME,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});

describe("getGameById", () => {
  it("lança 404 se a partida não existe", async () => {
    mockGameFindUnique.mockResolvedValue(null);

    await expect(getGameById("game-1", "user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lança 404 se a partida pertence a outro usuário", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord({ userId: "user-2" }));

    await expect(getGameById("game-1", "user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("retorna a partida com as rodadas", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockGameFindUnique.mockResolvedValue(gameRecord());

    const game = await getGameById("game-1", "user-1");

    expect(game.id).toBe("game-1");
    expect(mockGameFindUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ rounds: expect.any(Object) }) }),
    );
  });
});

describe("getNextRound", () => {
  it("lança 409 se a partida já foi finalizada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord({ finishedAt: new Date() }));

    await expect(getNextRound("game-1", "user-1")).rejects.toMatchObject({
      statusCode: 409,
      message: "Esta partida já foi finalizada.",
    });
  });

  it("lança 409 se o número máximo de rodadas foi atingido", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockRoundCount.mockResolvedValue(TOTAL_ROUNDS_PER_GAME);

    await expect(getNextRound("game-1", "user-1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("lança 409 se não há locais disponíveis", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockRoundCount.mockResolvedValue(0);
    mockLocationFindMany.mockResolvedValue([]);

    await expect(getNextRound("game-1", "user-1")).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Não há locais"),
    });
  });

  it("retorna um local aleatório disponível com o número da próxima rodada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockRoundCount.mockResolvedValue(2);
    mockLocationFindMany.mockResolvedValue([
      { id: "loc-a", imageUrl: "http://img/a.jpg" },
      { id: "loc-b", imageUrl: "http://img/b.jpg" },
    ]);
    jest.spyOn(Math, "random").mockReturnValue(0);

    const result = await getNextRound("game-1", "user-1");

    expect(result.roundNumber).toBe(3);
    expect(result.totalRounds).toBe(TOTAL_ROUNDS_PER_GAME);
    expect(result.location).toEqual({ id: "loc-a", imageUrl: "http://img/a.jpg" });
  });
});

describe("submitGuess", () => {
  const location = { id: "loc-1", latitude: 0, longitude: 0 };
  const input = { locationId: "loc-1", guessLatitude: 0.001, guessLongitude: 0 };

  it("lança 409 se a partida já foi finalizada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord({ finishedAt: new Date() }));

    await expect(submitGuess("game-1", "user-1", input)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("lança 404 se o local não existe", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockLocationFindUnique.mockResolvedValue(null);

    await expect(submitGuess("game-1", "user-1", input)).rejects.toMatchObject({
      statusCode: 404,
      message: "Local não encontrado.",
    });
  });

  it("lança 409 se já atingiu o número máximo de rodadas", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockLocationFindUnique.mockResolvedValue(location);
    mockRoundCount.mockResolvedValue(TOTAL_ROUNDS_PER_GAME);

    await expect(submitGuess("game-1", "user-1", input)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lança 409 se o local já foi usado na partida (P2002)", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockLocationFindUnique.mockResolvedValue(location);
    mockRoundCount.mockResolvedValue(0);
    mockTransaction.mockRejectedValue({ code: "P2002" });

    await expect(submitGuess("game-1", "user-1", input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Você já enviou um palpite para este local nesta partida.",
    });
  });

  it("calcula distância e pontuação e registra a rodada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockLocationFindUnique.mockResolvedValue(location);
    mockRoundCount.mockResolvedValue(0);
    mockTransaction.mockResolvedValue([
      {
        id: "round-1",
        gameId: "game-1",
        locationId: "loc-1",
        roundNumber: 1,
        guessLatitude: input.guessLatitude,
        guessLongitude: input.guessLongitude,
        distanceMeters: 111.2,
        score: 691,
      },
      gameRecord({ score: 691 }),
    ]);
    mockGameFindUniqueOrThrow.mockResolvedValue(gameRecord({ score: 691 }));

    const result = await submitGuess("game-1", "user-1", input);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(result.round.roundNumber).toBe(1);
    expect(result.round.distanceMeters).toBeGreaterThan(100);
    expect(result.round.score).toBeGreaterThan(0);
    expect(result.round.correct).toEqual({ latitude: 0, longitude: 0 });
    expect(result.game.score).toBe(691);
  });

  it("finaliza a partida automaticamente na última rodada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockLocationFindUnique.mockResolvedValue(location);
    mockRoundCount.mockResolvedValue(TOTAL_ROUNDS_PER_GAME - 1);
    mockTransaction.mockResolvedValue([
      { id: "round-5", roundNumber: TOTAL_ROUNDS_PER_GAME, distanceMeters: 0, score: 1000, guessLatitude: 0, guessLongitude: 0 },
      gameRecord({ score: 2000, finishedAt: new Date() }),
    ]);
    mockGameFindUniqueOrThrow.mockResolvedValue(gameRecord({ score: 2000, finishedAt: new Date() }));

    const result = await submitGuess("game-1", "user-1", { locationId: "loc-1", guessLatitude: 0, guessLongitude: 0 });

    expect(mockGameFindUniqueOrThrow).toHaveBeenCalled();
    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: expect.objectContaining({
        score: { increment: expect.any(Number) },
        finishedAt: expect.any(Date),
      }),
    });
    expect(result.game.roundsPlayed).toBe(TOTAL_ROUNDS_PER_GAME);
  });
});

describe("finishGame", () => {
  it("lança 409 se a partida já foi finalizada", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord({ finishedAt: new Date() }));

    await expect(finishGame("game-1", "user-1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("finaliza a partida e retorna resumo", async () => {
    mockGameFindUnique.mockResolvedValue(gameRecord());
    mockRoundCount.mockResolvedValue(3);
    mockGameUpdate.mockResolvedValue(gameRecord({ finishedAt: new Date(), score: 900 }));

    const result = await finishGame("game-1", "user-1");

    expect(mockGameUpdate).toHaveBeenCalledWith({
      where: { id: "game-1" },
      data: { finishedAt: expect.any(Date) },
    });
    expect(result.roundsPlayed).toBe(3);
    expect(result.score).toBe(900);
    expect(result.finishedAt).toBeInstanceOf(Date);
  });
});
