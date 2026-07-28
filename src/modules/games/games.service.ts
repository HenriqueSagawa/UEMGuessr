import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { haversineDistanceMeters, calculateScore } from "../../lib/geo";
import type { SubmitGuessInput, ListGamesQuery } from "./games.schemas";

export const TOTAL_ROUNDS_PER_GAME = 5;

async function ensureOwnedGame(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });

  if (!game || game.userId !== userId) {
    throw new AppError("Partida não encontrada.", 404);
  }

  return game;
}

export async function createGame(userId: string) {
  return prisma.game.create({ data: { userId } });
}

export async function listGames(userId: string, { page, limit }: ListGamesQuery) {
  const [items, total] = await prisma.$transaction([
    prisma.game.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { rounds: true } } },
    }),
    prisma.game.count({ where: { userId } }),
  ]);

  return {
    items: items.map((game) => ({
      id: game.id,
      score: game.score,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      roundsPlayed: game._count.rounds,
      totalRounds: TOTAL_ROUNDS_PER_GAME,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getGameById(gameId: string, userId: string) {
  await ensureOwnedGame(gameId, userId);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { location: { select: { id: true, name: true, imageUrl: true, latitude: true, longitude: true } } },
      },
    },
  });

  return game;
}

export async function getNextRound(gameId: string, userId: string) {
  const game = await ensureOwnedGame(gameId, userId);

  if (game.finishedAt) {
    throw new AppError("Esta partida já foi finalizada.", 409);
  }

  const playedCount = await prisma.round.count({ where: { gameId } });

  if (playedCount >= TOTAL_ROUNDS_PER_GAME) {
    throw new AppError(
      "Esta partida já atingiu o número máximo de rodadas. Finalize a partida.",
      409,
    );
  }

  const availableLocations = await prisma.location.findMany({
    where: { rounds: { none: { gameId } } },
    select: { id: true, imageUrl: true },
  });

  if (availableLocations.length === 0) {
    throw new AppError(
      "Não há locais suficientes cadastrados para continuar esta partida.",
      409,
    );
  }

  const randomIndex = Math.floor(Math.random() * availableLocations.length);
  const location = availableLocations[randomIndex]!;

  return {
    roundNumber: playedCount + 1,
    totalRounds: TOTAL_ROUNDS_PER_GAME,
    location: { id: location.id, imageUrl: location.imageUrl },
  };
}

export async function submitGuess(gameId: string, userId: string, input: SubmitGuessInput) {
  const game = await ensureOwnedGame(gameId, userId);

  if (game.finishedAt) {
    throw new AppError("Esta partida já foi finalizada.", 409);
  }

  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new AppError("Local não encontrado.", 404);

  const playedCount = await prisma.round.count({ where: { gameId } });
  if (playedCount >= TOTAL_ROUNDS_PER_GAME) {
    throw new AppError(
      "Esta partida já atingiu o número máximo de rodadas. Finalize a partida.",
      409,
    );
  }

  const distanceMeters = haversineDistanceMeters(
    input.guessLatitude,
    input.guessLongitude,
    Number(location.latitude),
    Number(location.longitude),
  );

  const score = calculateScore(distanceMeters);
  const roundNumber = playedCount + 1;
  const isLastRound = roundNumber >= TOTAL_ROUNDS_PER_GAME;

  let round;
  try {
    [round] = await prisma.$transaction([
      prisma.round.create({
        data: {
          gameId,
          locationId: input.locationId,
          roundNumber,
          guessLatitude: input.guessLatitude,
          guessLongitude: input.guessLongitude,
          distanceMeters,
          score,
        },
      }),
      prisma.game.update({
        where: { id: gameId },
        data: {
          score: { increment: score },
          ...(isLastRound && { finishedAt: new Date() }),
        },
      }),
    ]);
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AppError("Você já enviou um palpite para este local nesta partida.", 409);
    }
    throw error;
  }

  const updatedGame = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });

  return {
    round: {
      roundNumber: round.roundNumber,
      distanceMeters: Number(round.distanceMeters),
      score: round.score,
      guess: { latitude: Number(round.guessLatitude), longitude: Number(round.guessLongitude) },
      correct: { latitude: Number(location.latitude), longitude: Number(location.longitude) },
    },
    game: {
      id: updatedGame.id,
      score: updatedGame.score,
      finishedAt: updatedGame.finishedAt,
      roundsPlayed: roundNumber,
      totalRounds: TOTAL_ROUNDS_PER_GAME,
    },
  };
}

export async function finishGame(gameId: string, userId: string) {
  const game = await ensureOwnedGame(gameId, userId);

  if (game.finishedAt) {
    throw new AppError("Esta partida já foi finalizada.", 409);
  }

  const roundsPlayed = await prisma.round.count({ where: { gameId } });

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: { finishedAt: new Date() },
  });

  return {
    id: updated.id,
    score: updated.score,
    startedAt: updated.startedAt,
    finishedAt: updated.finishedAt,
    roundsPlayed,
    totalRounds: TOTAL_ROUNDS_PER_GAME,
  };
}