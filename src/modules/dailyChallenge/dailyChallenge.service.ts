import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/appError';
import { haversineDistanceMeters, calculateScore } from '../../lib/geo';
import type { SubmitDailyChallengeGuessInput } from './dailyChallenge.schemas';

export const CHALLENGE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TIME_LIMIT_SECONDS = 60;

const RECENT_DAYS_TO_AVOID = 7;
const LEADERBOARD_DEFAULT_LIMIT = 10;

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function remainingSeconds(
  startedAt: Date,
  limitSeconds: number,
  now: Date,
): number {
  const elapsed = (now.getTime() - startedAt.getTime()) / 1000;
  return Math.max(0, Math.floor(limitSeconds - elapsed));
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function ensureActiveChallenge() {
  const now = new Date();
  const today = utcMidnight(now);

  const existing = await prisma.dailyChallenge.findUnique({
    where: { challengeDate: today },
    include: { location: true },
  });
  if (existing) return existing;

  const recentSince = new Date(
    today.getTime() - RECENT_DAYS_TO_AVOID * CHALLENGE_WINDOW_MS,
  );
  const recentChallenges = await prisma.dailyChallenge.findMany({
    where: { challengeDate: { gte: recentSince } },
    select: { locationId: true },
  });
  const excludedLocationIds = recentChallenges.map(
    (challenge) => challenge.locationId,
  );
  const where =
    excludedLocationIds.length > 0
      ? { id: { notIn: excludedLocationIds } }
      : {};

  const availableCount = await prisma.location.count({ where });
  if (availableCount === 0) {
    throw new AppError(
      'Não há locais cadastrados para gerar o desafio diário.',
      503,
    );
  }

  const skip = Math.floor(Math.random() * availableCount);
  const location = await prisma.location.findFirst({ where, skip });
  if (!location) {
    throw new AppError(
      'Não há locais cadastrados para gerar o desafio diário.',
      503,
    );
  }

  const endsAt = new Date(today.getTime() + CHALLENGE_WINDOW_MS);

  try {
    return await prisma.dailyChallenge.create({
      data: {
        challengeDate: today,
        startsAt: today,
        endsAt,
        timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
        locationId: location.id,
      },
      include: { location: true },
    });
  } catch (error: unknown) {
    if (isPrismaUniqueViolation(error)) {
      const challenge = await prisma.dailyChallenge.findUnique({
        where: { challengeDate: today },
        include: { location: true },
      });
      if (challenge) return challenge;
    }
    throw error;
  }
}

export async function getCurrentDailyChallenge(userId: string) {
  const challenge = await ensureActiveChallenge();
  const now = new Date();

  const attempt = await prisma.dailyChallengeAttempt.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId } },
  });

  let status:
    | { state: 'not_started' }
    | {
        state: 'in_progress';
        attemptId: string;
        startedAt: Date;
        remainingSeconds: number;
      }
    | {
        state: 'submitted';
        attemptId: string;
        score: number;
        distanceMeters: number;
        submittedAt: Date;
        guess: { latitude: number; longitude: number };
        correct: { latitude: number; longitude: number };
      };

  if (!attempt) {
    status = { state: 'not_started' };
  } else if (!attempt.submittedAt) {
    status = {
      state: 'in_progress',
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
      remainingSeconds: remainingSeconds(
        attempt.startedAt,
        challenge.timeLimitSeconds,
        now,
      ),
    };
  } else {
    status = {
      state: 'submitted',
      attemptId: attempt.id,
      score: attempt.score!,
      distanceMeters: Number(attempt.distanceMeters!),
      submittedAt: attempt.submittedAt,
      guess: {
        latitude: Number(attempt.guessLatitude!),
        longitude: Number(attempt.guessLongitude!),
      },
      correct: {
        latitude: Number(challenge.location.latitude),
        longitude: Number(challenge.location.longitude),
      },
    };
  }

  return {
    id: challenge.id,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    timeLimitSeconds: challenge.timeLimitSeconds,
    windowRemainingSeconds: Math.max(
      0,
      Math.floor((challenge.endsAt.getTime() - now.getTime()) / 1000),
    ),
    location: {
      id: challenge.location.id,
      name: challenge.location.name,
      imageUrl: challenge.location.imageUrl,
    },
    status,
  };
}

export async function startDailyChallenge(challengeId: string, userId: string) {
  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge) throw new AppError('Desafio diário não encontrado.', 404);

  const now = new Date();
  if (now >= challenge.endsAt) {
    throw new AppError('O desafio diário já foi encerrado.', 409);
  }

  const existing = await prisma.dailyChallengeAttempt.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });

  if (existing?.submittedAt) {
    throw new AppError('Você já participou do desafio diário de hoje.', 409);
  }

  const attempt =
    existing ??
    (await prisma.dailyChallengeAttempt.create({
      data: { challengeId, userId },
    }));

  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    timeLimitSeconds: challenge.timeLimitSeconds,
    remainingSeconds: remainingSeconds(
      attempt.startedAt,
      challenge.timeLimitSeconds,
      now,
    ),
  };
}

export async function submitDailyChallengeGuess(
  challengeId: string,
  userId: string,
  input: SubmitDailyChallengeGuessInput,
) {
  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id: challengeId },
    include: { location: true },
  });
  if (!challenge) throw new AppError('Desafio diário não encontrado.', 404);

  const now = new Date();
  if (now >= challenge.endsAt) {
    throw new AppError('O desafio diário já foi encerrado.', 409);
  }

  const attempt = await prisma.dailyChallengeAttempt.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });
  if (!attempt) {
    throw new AppError(
      'Inicie o desafio diário antes de enviar seu palpite.',
      400,
    );
  }
  if (attempt.submittedAt) {
    throw new AppError(
      'Você já enviou seu palpite no desafio diário de hoje.',
      409,
    );
  }

  const elapsedSeconds = (now.getTime() - attempt.startedAt.getTime()) / 1000;
  if (elapsedSeconds > challenge.timeLimitSeconds) {
    throw new AppError('Tempo esgotado para responder ao desafio diário.', 410);
  }

  const distanceMeters = haversineDistanceMeters(
    input.guessLatitude,
    input.guessLongitude,
    Number(challenge.location.latitude),
    Number(challenge.location.longitude),
  );
  const score = calculateScore(distanceMeters);

  const updated = await prisma.dailyChallengeAttempt.update({
    where: { id: attempt.id },
    data: {
      guessLatitude: input.guessLatitude,
      guessLongitude: input.guessLongitude,
      distanceMeters,
      score,
      submittedAt: now,
    },
  });

  return {
    score: updated.score,
    distanceMeters: Number(updated.distanceMeters),
    submittedAt: updated.submittedAt,
    guess: {
      latitude: Number(updated.guessLatitude),
      longitude: Number(updated.guessLongitude),
    },
    correct: {
      latitude: Number(challenge.location.latitude),
      longitude: Number(challenge.location.longitude),
    },
    challenge: { id: challenge.id, endsAt: challenge.endsAt },
  };
}

export async function getDailyChallengeLeaderboard(
  challengeId: string,
  userId: string,
  limit: number,
) {
  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, endsAt: true },
  });
  if (!challenge) throw new AppError('Desafio diário não encontrado.', 404);

  const take = limit || LEADERBOARD_DEFAULT_LIMIT;

  const attempts = await prisma.dailyChallengeAttempt.findMany({
    where: { challengeId, submittedAt: { not: null } },
    orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
    take,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const top = attempts.map((attempt, index) => ({
    rank: index + 1,
    userId: attempt.userId,
    username: attempt.user.username,
    displayName: attempt.user.displayName,
    avatarUrl: attempt.user.avatarUrl,
    score: attempt.score!,
    distanceMeters: Number(attempt.distanceMeters!),
    submittedAt: attempt.submittedAt!,
  }));

  const myAttempt = await prisma.dailyChallengeAttempt.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });

  let user = null;
  if (myAttempt?.submittedAt) {
    const betterCount = await prisma.dailyChallengeAttempt.count({
      where: {
        challengeId,
        submittedAt: { not: null },
        score: { gt: myAttempt.score! },
      },
    });
    user = {
      rank: betterCount + 1,
      userId: myAttempt.userId,
      score: myAttempt.score!,
      distanceMeters: Number(myAttempt.distanceMeters!),
      submittedAt: myAttempt.submittedAt,
    };
  }

  return {
    challenge: { id: challenge.id, endsAt: challenge.endsAt },
    top,
    user,
  };
}
