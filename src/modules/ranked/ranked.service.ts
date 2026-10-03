import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/appError';
import { haversineDistanceMeters, calculateScore } from '../../lib/geo';
import { rankedEvents } from '../../realtime/rankedEvents';
import type { SubmitAnswerInput, CreateSeasonInput } from './ranked.schemas';
import {
  BASE_RATING,
  DIVISION_THRESHOLDS,
  divisionForRating,
  divisionLabel,
  EARLY_ANSWER_WINDOW_SECONDS,
  QUEUE_TTL_MS,
  ROUND_TIME_LIMIT_SECONDS,
  ratingDelta,
  roundDamage,
  roundMultiplier,
} from './ranked.lib';

const USER_PUBLIC_SELECT = {
  select: { id: true, username: true, displayName: true, avatarUrl: true },
} as const;

type RankedTx = {
  $queryRaw: typeof prisma.$queryRaw;
  rankedMatch: typeof prisma.rankedMatch;
  rankedRound: typeof prisma.rankedRound;
  rankedProfile: typeof prisma.rankedProfile;
  rankedQueueEntry: typeof prisma.rankedQueueEntry;
  location: typeof prisma.location;
  season: typeof prisma.season;
};

// A linha da partida é o ponto de serialização para respostas, resolução e
// encerramento. O lock vale entre processos e termina junto da transação.
async function lockMatch(tx: RankedTx, matchId: string) {
  await tx.$queryRaw`SELECT id FROM "RankedMatch" WHERE id = ${matchId} FOR UPDATE`;
}

async function lockMatchmakingUsers(tx: RankedTx, userIds: string[]) {
  for (const userId of [...userIds].sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function getActiveSeason() {
  const now = new Date();
  const season = await prisma.season.findFirst({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: 'desc' },
  });
  if (!season) {
    throw new AppError('Não há uma temporada ranqueada ativa no momento.', 409);
  }
  return season;
}

async function ensureProfile(userId: string, seasonId: string) {
  const existing = await prisma.rankedProfile.findUnique({
    where: { userId_seasonId: { userId, seasonId } },
  });
  if (existing) return existing;

  try {
    return await prisma.rankedProfile.create({
      data: {
        userId,
        seasonId,
        rating: BASE_RATING,
        division: divisionForRating(BASE_RATING),
        bestRating: BASE_RATING,
      },
    });
  } catch (error: unknown) {
    if (isPrismaUniqueViolation(error)) {
      const profile = await prisma.rankedProfile.findUnique({
        where: { userId_seasonId: { userId, seasonId } },
      });
      if (profile) return profile;
    }
    throw error;
  }
}

async function pickRandomLocation(
  db: { location: typeof prisma.location },
  excludeId?: string,
) {
  let where = excludeId ? { id: { not: excludeId } } : {};
  let count = await db.location.count({ where });
  if (count === 0 && excludeId) {
    // Um único local não deve deixar a partida permanentemente sem próxima rodada.
    where = {};
    count = await db.location.count({ where });
  }
  if (count === 0) {
    throw new AppError(
      'Não há locais cadastrados para iniciar a partida ranqueada.',
      503,
    );
  }
  const skip = Math.floor(Math.random() * count);
  const location = await db.location.findFirst({ where, skip });
  if (!location) {
    throw new AppError(
      'Não há locais cadastrados para iniciar a partida ranqueada.',
      503,
    );
  }
  return location;
}

function buildRoundResult(
  round: {
    roundNumber: number;
    multiplier: { toString(): string };
    resolvedAt: Date | null;
    player1Score: number | null;
    player2Score: number | null;
    player1DistanceMeters: { toString(): string } | null;
    player2DistanceMeters: { toString(): string } | null;
    player1Damage: number | null;
    player2Damage: number | null;
  },
  isPlayer1: boolean,
) {
  const myScore = isPlayer1 ? round.player1Score : round.player2Score;
  const opponentScore = isPlayer1 ? round.player2Score : round.player1Score;
  const myDistance = isPlayer1
    ? round.player1DistanceMeters
    : round.player2DistanceMeters;
  const opponentDistance = isPlayer1
    ? round.player2DistanceMeters
    : round.player1DistanceMeters;
  const myDamage = isPlayer1 ? round.player1Damage : round.player2Damage;
  const opponentDamage = isPlayer1 ? round.player2Damage : round.player1Damage;

  return {
    roundNumber: round.roundNumber,
    multiplier: Number(round.multiplier),
    myScore: myScore ?? 0,
    opponentScore: opponentScore ?? 0,
    myDistanceMeters: myDistance != null ? Number(myDistance) : null,
    opponentDistanceMeters:
      opponentDistance != null ? Number(opponentDistance) : null,
    myDamage: myDamage ?? 0,
    opponentDamage: opponentDamage ?? 0,
    resolvedAt: round.resolvedAt,
  };
}

function buildMatchStateDTO(
  match: {
    id: string;
    seasonId: string;
    status: string;
    player1Id: string;
    player2Id: string;
    player1Health: number;
    player2Health: number;
    winnerId: string | null;
    player1RatingDelta: number | null;
    player2RatingDelta: number | null;
    startedAt: Date;
    finishedAt: Date | null;
    player1: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
    player2: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
    rounds: Array<{
      roundNumber: number;
      multiplier: { toString(): string };
      startedAt: Date;
      deadline: Date;
      resolvedAt: Date | null;
      location: { id: string; imageUrl: string | null };
      player1AnsweredAt: Date | null;
      player2AnsweredAt: Date | null;
      player1Score: number | null;
      player2Score: number | null;
      player1DistanceMeters: { toString(): string } | null;
      player2DistanceMeters: { toString(): string } | null;
      player1Damage: number | null;
      player2Damage: number | null;
    }>;
  },
  userId: string,
) {
  const isPlayer1 = match.player1Id === userId;
  const myHealth = isPlayer1 ? match.player1Health : match.player2Health;
  const opponentHealth = isPlayer1 ? match.player2Health : match.player1Health;
  const me = isPlayer1 ? match.player1 : match.player2;
  const opponent = isPlayer1 ? match.player2 : match.player1;

  const current = match.rounds[match.rounds.length - 1]!;
  const now = new Date();

  const resolved = match.rounds.filter((round) => round.resolvedAt);
  const lastResult =
    resolved.length > 0 ? buildRoundResult(resolved.at(-1)!, isPlayer1) : null;

  return {
    match: {
      id: match.id,
      seasonId: match.seasonId,
      status: match.status,
      roundNumber: current.roundNumber,
      multiplier: Number(current.multiplier),
      myHealth,
      opponentHealth,
      winnerId: match.winnerId,
      myRatingDelta: isPlayer1
        ? match.player1RatingDelta
        : match.player2RatingDelta,
      opponentRatingDelta: isPlayer1
        ? match.player2RatingDelta
        : match.player1RatingDelta,
      startedAt: match.startedAt,
      finishedAt: match.finishedAt,
    },
    me: {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
    },
    opponent: {
      id: opponent.id,
      username: opponent.username,
      displayName: opponent.displayName,
      avatarUrl: opponent.avatarUrl,
    },
    currentRound: {
      roundNumber: current.roundNumber,
      multiplier: Number(current.multiplier),
      deadline: current.deadline,
      timeRemainingSeconds: Math.max(
        0,
        Math.floor((current.deadline.getTime() - now.getTime()) / 1000),
      ),
      location: {
        id: current.location.id,
        imageUrl: current.location.imageUrl,
      },
      myAnswered: isPlayer1
        ? !!current.player1AnsweredAt
        : !!current.player2AnsweredAt,
      opponentAnswered: isPlayer1
        ? !!current.player2AnsweredAt
        : !!current.player1AnsweredAt,
    },
    lastResult,
    history: resolved.map((round) => buildRoundResult(round, isPlayer1)),
  };
}

async function applyRatingResult(
  tx: RankedTx,
  match: { seasonId: string; player1Id: string; player2Id: string },
  winnerId: string,
) {
  const loserId =
    winnerId === match.player1Id ? match.player2Id : match.player1Id;

  // Protege os dois ratings mesmo se houver partidas antigas simultâneas.
  await tx.$queryRaw`SELECT id FROM "RankedProfile" WHERE "seasonId" = ${match.seasonId} AND "userId" IN (${winnerId}, ${loserId}) ORDER BY "userId" FOR UPDATE`;

  const [winnerProfile, loserProfile] = await Promise.all([
    tx.rankedProfile.findUnique({
      where: {
        userId_seasonId: { userId: winnerId, seasonId: match.seasonId },
      },
    }),
    tx.rankedProfile.findUnique({
      where: { userId_seasonId: { userId: loserId, seasonId: match.seasonId } },
    }),
  ]);
  if (!winnerProfile || !loserProfile) {
    throw new AppError('Perfil ranqueado ausente para finalizar a partida.', 500);
  }

  const winnerDelta = ratingDelta(winnerProfile.rating, loserProfile.rating, 1);
  const loserDelta = ratingDelta(loserProfile.rating, winnerProfile.rating, 0);
  const winnerRating = Math.max(0, winnerProfile.rating + winnerDelta);
  const loserRating = Math.max(0, loserProfile.rating + loserDelta);

  await tx.rankedProfile.update({
    where: { id: winnerProfile.id },
    data: {
      rating: winnerRating,
      division: divisionForRating(winnerRating),
      bestRating: Math.max(winnerProfile.bestRating, winnerRating),
      wins: { increment: 1 },
    },
  });
  await tx.rankedProfile.update({
    where: { id: loserProfile.id },
    data: {
      rating: loserRating,
      division: divisionForRating(loserRating),
      losses: { increment: 1 },
    },
  });
  return {
    p1Delta: match.player1Id === winnerId ? winnerDelta : loserDelta,
    p2Delta: match.player1Id === winnerId ? loserDelta : winnerDelta,
  };
}

export async function resolveRound(
  matchId: string,
  roundNumber: number,
  now: Date,
) {
  let player1Id = '';
  let player2Id = '';
  const result = await prisma.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const round = await tx.rankedRound.findUnique({
      where: { matchId_roundNumber: { matchId, roundNumber } },
      include: { match: true },
    });
    if (!round || round.resolvedAt) return null;

    const match = round.match;
    if (match.status !== 'IN_PROGRESS') return null;
    if (
      now < round.deadline &&
      (!round.player1AnsweredAt || !round.player2AnsweredAt)
    ) return null;

    player1Id = match.player1Id;
    player2Id = match.player2Id;

    const multiplier = Number(round.multiplier);
    const p1Score = round.player1Score ?? 0;
    const p2Score = round.player2Score ?? 0;
    const damage = roundDamage(Math.abs(p1Score - p2Score), multiplier);
    const p1Damage = p1Score > p2Score ? damage : 0;
    const p2Damage = p2Score > p1Score ? damage : 0;

    const p1Health = Math.max(0, match.player1Health - p2Damage);
    const p2Health = Math.max(0, match.player2Health - p1Damage);
    const p1Dead = p1Health <= 0;
    const p2Dead = p2Health <= 0;
    const isOver = p1Dead || p2Dead;
    const winnerId = isOver
      ? p1Dead
        ? match.player2Id
        : match.player1Id
      : null;

    // Nenhum jogador respondeu dentro do prazo: partida abandonada.
    const abandoned =
      round.player1AnsweredAt === null && round.player2AnsweredAt === null;

    await tx.rankedRound.update({
      where: { id: round.id },
      data: {
        resolvedAt: now,
        ...(abandoned
          ? {}
          : { player1Damage: p1Damage, player2Damage: p2Damage }),
      },
    });

    if (abandoned) {
      await tx.rankedMatch.update({
        where: { id: match.id },
        data: {
          status: 'ABANDONED',
          finishedAt: now,
        },
      });
      return { finished: true, winnerId: null, roundNumber };
    }

    if (isOver) {
      const { p1Delta, p2Delta } = await applyRatingResult(
        tx,
        match,
        winnerId!,
      );

      await tx.rankedMatch.update({
        where: { id: match.id },
        data: {
          status: 'FINISHED',
          winnerId,
          player1Health: p1Health,
          player2Health: p2Health,
          player1RatingDelta: p1Delta,
          player2RatingDelta: p2Delta,
          finishedAt: now,
        },
      });
    } else {
      const nextRoundNumber = round.roundNumber + 1;
      const nextMultiplier = roundMultiplier(nextRoundNumber);
      const location = await pickRandomLocation(tx, round.locationId);

      await tx.rankedMatch.update({
        where: { id: match.id },
        data: {
          player1Health: p1Health,
          player2Health: p2Health,
          currentRoundNumber: nextRoundNumber,
          roundMultiplier: nextMultiplier,
        },
      });
      await tx.rankedRound.create({
        data: {
          matchId: match.id,
          roundNumber: nextRoundNumber,
          locationId: location.id,
          multiplier: nextMultiplier,
          deadline: new Date(now.getTime() + ROUND_TIME_LIMIT_SECONDS * 1000),
        },
      });
    }

    return { finished: isOver, winnerId, roundNumber };
  });

  if (result) {
    rankedEvents.emitRoundResolved({
      matchId,
      roundNumber,
      finished: result.finished,
      winnerId: result.winnerId,
      player1Id,
      player2Id,
    });
  }

  return result;
}

async function fetchMatch(matchId: string) {
  return prisma.rankedMatch.findUnique({
    where: { id: matchId },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          location: { select: { id: true, imageUrl: true } },
        },
      },
      player1: USER_PUBLIC_SELECT,
      player2: USER_PUBLIC_SELECT,
    },
  });
}

async function resolvePendingRounds(
  match: NonNullable<Awaited<ReturnType<typeof fetchMatch>>>,
) {
  const rounds = match.rounds;
  const last = rounds[rounds.length - 1];
  if (!last || last.resolvedAt) return;
  const now = new Date();
  if (now < last.deadline) return;
  await resolveRound(match.id, last.roundNumber, now);
}

async function matchWithBestOpponent(
  seasonId: string,
  joinerUserId: string,
  joinerRating: number,
  excludeQueueId?: string,
  attempts = 0,
  skippedIds: string[] = [],
) {
  if (attempts >= 10) return null;
  const now = new Date();
  const candidates = await prisma.rankedQueueEntry.findMany({
    where: {
      seasonId,
      status: 'WAITING',
      expiresAt: { gt: now },
      userId: { not: joinerUserId },
      ...(excludeQueueId || skippedIds.length > 0
        ? { id: {
            ...(excludeQueueId ? { not: excludeQueueId } : {}),
            ...(skippedIds.length > 0 ? { notIn: skippedIds } : {}),
          } }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });

  let best: (typeof candidates)[number] | null = null;
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    const diff = Math.abs(candidate.rating - joinerRating);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  if (!best) return null;

  const outcome = await prisma.$transaction(async (tx) => {
    await lockMatchmakingUsers(tx, [best.userId, joinerUserId]);
    await tx.$queryRaw`SELECT id FROM "Season" WHERE id = ${seasonId} FOR UPDATE`;
    const season = await tx.season.findUnique({ where: { id: seasonId } });
    const matchNow = new Date();
    if (!season || season.status !== 'ACTIVE' || season.startsAt > matchNow ||
      (season.endsAt && season.endsAt <= matchNow)) {
      throw new AppError('A temporada ranqueada foi encerrada.', 409);
    }
    const joinerMatch = await tx.rankedMatch.findFirst({
      where: {
        status: 'IN_PROGRESS',
        OR: [{ player1Id: joinerUserId }, { player2Id: joinerUserId }],
      },
      select: { id: true, player1Id: true, player2Id: true },
    });
    if (joinerMatch) {
      return {
        matchId: joinerMatch.id,
        player1Id: joinerMatch.player1Id,
        player2Id: joinerMatch.player2Id,
        created: false,
      };
    }
    const opponentMatch = await tx.rankedMatch.findFirst({
      where: {
        status: 'IN_PROGRESS',
        OR: [{ player1Id: best.userId }, { player2Id: best.userId }],
      },
      select: { id: true },
    });
    if (opponentMatch) return null;

    // Reserva atômica do candidato: apenas um request consegue alterar o status
    // de WAITING para MATCHED. Se outro request venceu a corrida, count === 0.
    const reservation = await tx.rankedQueueEntry.updateMany({
      where: { id: best.id, status: 'WAITING', expiresAt: { gt: new Date() } },
      data: { status: 'MATCHED' },
    });
    if (reservation.count === 0) return null;

    const multiplier = roundMultiplier(1);
    const location = await pickRandomLocation(tx);
    const match = await tx.rankedMatch.create({
      data: {
        seasonId,
        player1Id: best.userId,
        player2Id: joinerUserId,
        roundMultiplier: multiplier,
        currentRoundNumber: 1,
        rounds: {
          create: {
            roundNumber: 1,
            locationId: location.id,
            multiplier,
            deadline: new Date(matchNow.getTime() + ROUND_TIME_LIMIT_SECONDS * 1000),
          },
        },
      },
      select: { id: true, player1Id: true, player2Id: true },
    });

    await tx.rankedQueueEntry.update({
      where: { id: best.id },
      data: { matchedMatchId: match.id },
    });

    return {
      matchId: match.id,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      created: true,
    };
  });

  if (outcome) {
    if (outcome.created) {
      rankedEvents.emitMatchCreated({
        matchId: outcome.matchId,
        player1Id: outcome.player1Id,
        player2Id: outcome.player2Id,
      });
    }
    return outcome.matchId;
  }

  // Outro request reservou o candidato primeiro: tenta novamente com os
  // candidatos restantes (o candidato perdido não é mais WAITING).
  return matchWithBestOpponent(
    seasonId,
    joinerUserId,
    joinerRating,
    excludeQueueId,
    attempts + 1,
    [...skippedIds, best.id],
  );
}

// ---------- Fila de matchmaking ----------

export async function joinRankedQueue(userId: string) {
  const season = await getActiveSeason();
  const profile = await ensureProfile(userId, season.id);
  const now = new Date();

  const activeMatch = await prisma.rankedMatch.findFirst({
    where: {
      status: 'IN_PROGRESS',
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
  });
  if (activeMatch) {
    throw new AppError('Você já está em uma partida ranqueada.', 409);
  }

  await prisma.rankedQueueEntry.deleteMany({
    where: { userId, status: 'WAITING' },
  });

  const immediate = await matchWithBestOpponent(
    season.id,
    userId,
    profile.rating,
  );
  if (immediate) return { status: 'matched', matchId: immediate };

  const entry = await prisma.rankedQueueEntry.create({
    data: {
      seasonId: season.id,
      userId,
      rating: profile.rating,
      expiresAt: new Date(now.getTime() + QUEUE_TTL_MS),
    },
  });

  const matched = await matchWithBestOpponent(
    season.id,
    userId,
    profile.rating,
    entry.id,
  );
  if (matched) {
    await prisma.rankedQueueEntry.update({
      where: { id: entry.id },
      data: { status: 'MATCHED', matchedMatchId: matched },
    });
    return { status: 'matched', matchId: matched };
  }

  rankedEvents.emitQueued({
    userId,
    queueId: entry.id,
    rating: entry.rating,
    expiresAt: entry.expiresAt,
  });

  return { status: 'queued', queueId: entry.id };
}

export async function getRankedQueueStatus(
  userId: string,
): Promise<
  | { status: 'matched'; matchId: string }
  | { status: 'queued'; queueId: string; rating: number; expiresAt: Date }
  | { status: 'not_queued' }
> {
  const season = await getActiveSeason();
  const now = new Date();

  const matched = await prisma.rankedQueueEntry.findFirst({
    where: {
      userId,
      seasonId: season.id,
      status: 'MATCHED',
      match: { status: 'IN_PROGRESS' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (matched?.matchedMatchId) {
    return { status: 'matched', matchId: matched.matchedMatchId };
  }

  const waiting = await prisma.rankedQueueEntry.findFirst({
    where: { userId, seasonId: season.id, status: 'WAITING' },
    orderBy: { createdAt: 'desc' },
  });
  if (waiting) {
    if (waiting.expiresAt <= now) {
      const removed = await prisma.rankedQueueEntry.deleteMany({
        where: { id: waiting.id, status: 'WAITING', expiresAt: { lte: now } },
      });
      if (removed.count === 0) {
        const activeMatchId = await findUserActiveMatch(userId);
        if (activeMatchId) return { status: 'matched', matchId: activeMatchId };
      }
      return { status: 'not_queued' };
    }
    return {
      status: 'queued',
      queueId: waiting.id,
      rating: waiting.rating,
      expiresAt: waiting.expiresAt,
    };
  }

  return { status: 'not_queued' };
}

export async function leaveRankedQueue(userId: string) {
  const season = await getActiveSeason();
  const result = await prisma.rankedQueueEntry.deleteMany({
    where: { userId, seasonId: season.id, status: 'WAITING' },
  });
  if (result.count > 0) {
    rankedEvents.emitQueueLeft({ userId });
  }
  return { status: 'left' };
}

export async function findUserActiveMatch(userId: string) {
  const match = await prisma.rankedMatch.findFirst({
    where: {
      status: 'IN_PROGRESS',
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    select: { id: true },
    orderBy: { startedAt: 'desc' },
  });
  return match?.id ?? null;
}

// ---------- Partida ----------

export async function getRankedMatch(matchId: string, userId: string) {
  let match = await fetchMatch(matchId);
  if (!match || (match.player1Id !== userId && match.player2Id !== userId)) {
    throw new AppError('Partida ranqueada não encontrada.', 404);
  }

  await resolvePendingRounds(match);

  match = await fetchMatch(matchId);
  if (!match) throw new AppError('Partida ranqueada não encontrada.', 404);

  return buildMatchStateDTO(match, userId);
}

export async function submitRankedAnswer(
  matchId: string,
  userId: string,
  roundNumber: number,
  input: SubmitAnswerInput,
) {
  const initialMatch = await prisma.rankedMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true, status: true },
  });
  if (!initialMatch || (initialMatch.player1Id !== userId && initialMatch.player2Id !== userId)) {
    throw new AppError('Partida ranqueada não encontrada.', 404);
  }
  if (initialMatch.status !== 'IN_PROGRESS') {
    throw new AppError('Esta partida ranqueada já foi encerrada.', 409);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await lockMatch(tx, matchId);
    const round = await tx.rankedRound.findUnique({
      where: { matchId_roundNumber: { matchId, roundNumber } },
      include: { match: true, location: true },
    });
    if (!round) throw new AppError('Rodada não encontrada.', 404);
    if (round.match.player1Id !== userId && round.match.player2Id !== userId) {
      throw new AppError('Partida ranqueada não encontrada.', 404);
    }
    if (round.match.status !== 'IN_PROGRESS') {
      throw new AppError('Esta partida ranqueada já foi encerrada.', 409);
    }
    if (round.roundNumber !== round.match.currentRoundNumber) {
      throw new AppError('Esta não é a rodada atual da partida.', 409);
    }
    if (round.resolvedAt) {
      throw new AppError('Esta rodada já foi encerrada.', 410);
    }

    const now = new Date();
    if (now >= round.deadline) return { expired: true as const };
    const isPlayer1 = round.match.player1Id === userId;
    if (isPlayer1 ? round.player1AnsweredAt : round.player2AnsweredAt) {
      throw new AppError('Você já respondeu esta rodada.', 409);
    }

    const distanceMeters = haversineDistanceMeters(
      input.guessLatitude,
      input.guessLongitude,
      Number(round.location.latitude),
      Number(round.location.longitude),
    );
    const score = calculateScore(distanceMeters);
    const isFirstAnswer = !round.player1AnsweredAt && !round.player2AnsweredAt;
    let deadline = round.deadline;
    if (isFirstAnswer) {
      const originalDeadline = new Date(
        round.startedAt.getTime() + ROUND_TIME_LIMIT_SECONDS * 1000,
      );
      const earlyCutoff = new Date(
        originalDeadline.getTime() - EARLY_ANSWER_WINDOW_SECONDS * 1000,
      );
      if (now <= earlyCutoff) {
        const shortened = new Date(
          now.getTime() + EARLY_ANSWER_WINDOW_SECONDS * 1000,
        );
        deadline = shortened < round.deadline ? shortened : round.deadline;
      }
    }

    const answerData = isPlayer1
      ? {
          player1GuessLatitude: input.guessLatitude,
          player1GuessLongitude: input.guessLongitude,
          player1Score: score,
          player1DistanceMeters: distanceMeters,
          player1AnsweredAt: now,
        }
      : {
          player2GuessLatitude: input.guessLatitude,
          player2GuessLongitude: input.guessLongitude,
          player2Score: score,
          player2DistanceMeters: distanceMeters,
          player2AnsweredAt: now,
        };

    await tx.rankedRound.update({
      where: { id: round.id },
      data: {
        ...answerData,
        ...(deadline.getTime() !== round.deadline.getTime() && { deadline }),
      },
    });
    return {
      expired: false as const,
      opponentAnswered: isPlayer1
        ? !!round.player2AnsweredAt
        : !!round.player1AnsweredAt,
      player1Id: round.match.player1Id,
      player2Id: round.match.player2Id,
    };
  });

  if (outcome.expired) {
    await resolveRound(matchId, roundNumber, new Date());
    throw new AppError('O tempo da rodada esgotou.', 410);
  }

  rankedEvents.emitRoundAnswered({
    matchId,
    roundNumber,
    player1Id: outcome.player1Id,
    player2Id: outcome.player2Id,
  });

  if (outcome.opponentAnswered) {
    await resolveRound(matchId, roundNumber, new Date());
  }

  const match = await fetchMatch(matchId);
  if (!match) throw new AppError('Partida ranqueada não encontrada.', 404);

  return buildMatchStateDTO(match, userId);
}

// ---------- Perfil e temporadas ----------

export async function getRankedProfile(userId: string) {
  const season = await getActiveSeason();
  const profile = await ensureProfile(userId, season.id);
  return {
    season: {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    },
    profile: {
      rating: profile.rating,
      division: profile.division,
      divisionLabel: divisionLabel(profile.division),
      wins: profile.wins,
      losses: profile.losses,
      bestRating: profile.bestRating,
    },
  };
}

export async function getRankedLeaderboard(userId: string, limit: number) {
  const season = await getActiveSeason();

  const profiles = await prisma.rankedProfile.findMany({
    where: { seasonId: season.id },
    orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { losses: 'asc' }],
    take: limit,
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

  const top = profiles.map((profile, index) => ({
    rank: index + 1,
    userId: profile.userId,
    username: profile.user.username,
    displayName: profile.user.displayName,
    avatarUrl: profile.user.avatarUrl,
    rating: profile.rating,
    division: profile.division,
    divisionLabel: divisionLabel(profile.division),
    wins: profile.wins,
    losses: profile.losses,
  }));

  const myProfile = await ensureProfile(userId, season.id);
  const betterCount = await prisma.rankedProfile.count({
    where: { seasonId: season.id, rating: { gt: myProfile.rating } },
  });

  return {
    season: { id: season.id, name: season.name },
    top,
    user: {
      rank: betterCount + 1,
      rating: myProfile.rating,
      division: myProfile.division,
      divisionLabel: divisionLabel(myProfile.division),
      wins: myProfile.wins,
      losses: myProfile.losses,
    },
  };
}

// ---------- Estatísticas ----------

export async function getSeasonStats(seasonId?: string) {
  const season = seasonId
    ? await prisma.season.findUnique({ where: { id: seasonId } })
    : await getActiveSeason();
  if (!season) throw new AppError('Temporada não encontrada.', 404);

  const [divisionGroups, players, totalMatches, finishedMatches, abandonedMatches, ratingAgg, top] =
    await Promise.all([
      prisma.rankedProfile.groupBy({
        by: ['division'],
        where: { seasonId: season.id },
        _count: { _all: true },
      }),
      prisma.rankedProfile.count({ where: { seasonId: season.id } }),
      prisma.rankedMatch.count({ where: { seasonId: season.id } }),
      prisma.rankedMatch.count({
        where: { seasonId: season.id, status: 'FINISHED' },
      }),
      prisma.rankedMatch.count({
        where: { seasonId: season.id, status: 'ABANDONED' },
      }),
      prisma.rankedProfile.aggregate({
        where: { seasonId: season.id },
        _avg: { rating: true },
        _max: { bestRating: true },
      }),
      prisma.rankedProfile.findFirst({
        where: { seasonId: season.id },
        orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { losses: 'asc' }],
        include: { user: USER_PUBLIC_SELECT },
      }),
    ]);

  const byDivision = DIVISION_THRESHOLDS.map((tier) => {
    const group = divisionGroups.find((g) => g.division === tier.division);
    return {
      division: tier.division,
      divisionLabel: tier.label,
      players: group?._count._all ?? 0,
    };
  }).filter((entry) => entry.players > 0);

  return {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
    },
    totals: {
      players,
      totalMatches,
      finishedMatches,
      abandonedMatches,
      inProgressMatches: totalMatches - finishedMatches - abandonedMatches,
      averageRating:
        ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating) : null,
      topBestRating: ratingAgg._max.bestRating ?? null,
    },
    byDivision,
    top: top
      ? {
          userId: top.userId,
          username: top.user.username,
          displayName: top.user.displayName,
          avatarUrl: top.user.avatarUrl,
          rating: top.rating,
          division: top.division,
          divisionLabel: divisionLabel(top.division),
          wins: top.wins,
          losses: top.losses,
        }
      : null,
  };
}

export async function getUserStats(userId: string) {
  const season = await getActiveSeason();
  const profile = await ensureProfile(userId, season.id);
  const totalMatches = profile.wins + profile.losses;

  const recentMatches = await prisma.rankedMatch.findMany({
    where: {
      seasonId: season.id,
      status: 'FINISHED',
      winnerId: { not: null },
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { finishedAt: 'desc' },
    take: 100,
    select: { winnerId: true },
  });

  let currentStreak = 0;
  for (const match of recentMatches) {
    const isWin = match.winnerId === userId;
    if (currentStreak === 0) {
      currentStreak = isWin ? 1 : -1;
    } else if ((currentStreak > 0) === isWin) {
      currentStreak = isWin ? currentStreak + 1 : currentStreak - 1;
    } else {
      break;
    }
  }

  const betterCount = await prisma.rankedProfile.count({
    where: { seasonId: season.id, rating: { gt: profile.rating } },
  });

  return {
    season: { id: season.id, name: season.name },
    profile: {
      rank: betterCount + 1,
      rating: profile.rating,
      division: profile.division,
      divisionLabel: divisionLabel(profile.division),
      wins: profile.wins,
      losses: profile.losses,
      totalMatches,
      winRate: totalMatches > 0 ? profile.wins / totalMatches : 0,
      bestRating: profile.bestRating,
      currentStreak: {
        direction:
          currentStreak === 0 ? 'none' : currentStreak > 0 ? 'win' : 'loss',
        count: Math.abs(currentStreak),
      },
    },
  };
}

export async function getUserMatchHistory(userId: string, limit: number) {
  const season = await getActiveSeason();

  const matches = await prisma.rankedMatch.findMany({
    where: {
      seasonId: season.id,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      player1: USER_PUBLIC_SELECT,
      player2: USER_PUBLIC_SELECT,
    },
  });

  return {
    season: { id: season.id, name: season.name },
    matches: matches.map((match) => {
      const isPlayer1 = match.player1Id === userId;
      const opponent = isPlayer1 ? match.player2 : match.player1;
      const myRatingDelta = isPlayer1
        ? match.player1RatingDelta
        : match.player2RatingDelta;
      return {
        matchId: match.id,
        status: match.status,
        result:
          match.status === 'FINISHED'
            ? match.winnerId === userId
              ? 'win'
              : 'loss'
            : match.status === 'ABANDONED'
              ? 'abandoned'
              : 'in_progress',
        myRatingDelta,
        opponent: {
          id: opponent.id,
          username: opponent.username,
          displayName: opponent.displayName,
          avatarUrl: opponent.avatarUrl,
        },
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
      };
    }),
  };
}

export async function listSeasons() {
  return prisma.season.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });
}

async function endSeason(tx: RankedTx, seasonId: string, endedAt: Date) {
  await tx.season.update({
    where: { id: seasonId },
    data: { status: 'ENDED', endsAt: endedAt },
  });
  await tx.rankedMatch.updateMany({
    where: { seasonId, status: 'IN_PROGRESS' },
    data: { status: 'ABANDONED', finishedAt: endedAt },
  });
}

export async function createSeason(input: CreateSeasonInput) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(781293481)`;
    const now = new Date();
    const active = await tx.season.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startsAt: 'desc' },
    });
    if (active) await endSeason(tx, active.id, now);

    const total = await tx.season.count();
    const name = input.name?.trim() || `Temporada ${total + 1}`;
    return tx.season.create({
      data: { name, status: 'ACTIVE', startsAt: now },
    });
  });
}

export async function endCurrentSeason() {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(781293481)`;
    const now = new Date();
    const active = await tx.season.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startsAt: 'desc' },
    });
    if (!active)
      throw new AppError('Não há uma temporada ativa para encerrar.', 409);

    await endSeason(tx, active.id, now);
    return { id: active.id, name: active.name, status: 'ENDED', endsAt: now };
  });
}
