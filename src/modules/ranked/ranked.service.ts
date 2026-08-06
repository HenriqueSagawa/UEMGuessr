import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/appError';
import { haversineDistanceMeters, calculateScore } from '../../lib/geo';
import type { SubmitAnswerInput, CreateSeasonInput } from './ranked.schemas';
import {
  BASE_RATING,
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
  rankedMatch: typeof prisma.rankedMatch;
  rankedRound: typeof prisma.rankedRound;
  rankedProfile: typeof prisma.rankedProfile;
  rankedQueueEntry: typeof prisma.rankedQueueEntry;
  location: typeof prisma.location;
};

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
  const where = excludeId ? { id: { not: excludeId } } : {};
  const count = await db.location.count({ where });
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

async function computeRatingDeltas(
  tx: RankedTx,
  match: { seasonId: string; player1Id: string; player2Id: string },
  winnerId: string,
) {
  const loserId =
    winnerId === match.player1Id ? match.player2Id : match.player1Id;

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
  if (!winnerProfile || !loserProfile) return { p1Delta: 0, p2Delta: 0 };

  const winnerDelta = ratingDelta(winnerProfile.rating, loserProfile.rating, 1);
  const loserDelta = ratingDelta(loserProfile.rating, winnerProfile.rating, 0);

  return {
    p1Delta: match.player1Id === winnerId ? winnerDelta : loserDelta,
    p2Delta: match.player1Id === winnerId ? loserDelta : winnerDelta,
  };
}

async function applyRatingResult(
  tx: RankedTx,
  match: { seasonId: string; player1Id: string; player2Id: string },
  winnerId: string,
) {
  const loserId =
    winnerId === match.player1Id ? match.player2Id : match.player1Id;

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
  if (!winnerProfile || !loserProfile) return;

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
}

export async function resolveRound(
  matchId: string,
  roundNumber: number,
  now: Date,
) {
  return prisma.$transaction(async (tx) => {
    const round = await tx.rankedRound.findUnique({
      where: { matchId_roundNumber: { matchId, roundNumber } },
      include: { match: true },
    });
    if (!round || round.resolvedAt) return null;

    const match = round.match;
    if (match.status !== 'IN_PROGRESS') return null;

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
      const { p1Delta, p2Delta } = await computeRatingDeltas(
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
      await applyRatingResult(tx, match, winnerId!);
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
) {
  const now = new Date();
  const candidates = await prisma.rankedQueueEntry.findMany({
    where: {
      seasonId,
      status: 'WAITING',
      expiresAt: { gt: now },
      userId: { not: joinerUserId },
      ...(excludeQueueId ? { id: { not: excludeQueueId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
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

  const matchId = await prisma.$transaction(async (tx) => {
    // Reserva atômica do candidato: apenas um request consegue alterar o status
    // de WAITING para MATCHED. Se outro request venceu a corrida, count === 0.
    const reservation = await tx.rankedQueueEntry.updateMany({
      where: { id: best.id, status: 'WAITING' },
      data: { status: 'MATCHED' },
    });
    if (reservation.count === 0) return null;

    // Se o par já tem partida em andamento (pedido concorrente do oponente),
    // não criamos duplicata: devolvemos a partida existente.
    const existingMatch = await tx.rankedMatch.findFirst({
      where: {
        status: 'IN_PROGRESS',
        OR: [
          { player1Id: best.userId, player2Id: joinerUserId },
          { player1Id: joinerUserId, player2Id: best.userId },
        ],
      },
      select: { id: true },
    });
    if (existingMatch) return existingMatch.id;

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
            deadline: new Date(now.getTime() + ROUND_TIME_LIMIT_SECONDS * 1000),
          },
        },
      },
      select: { id: true },
    });

    await tx.rankedQueueEntry.update({
      where: { id: best.id },
      data: { matchedMatchId: match.id },
    });

    return match.id;
  });

  if (matchId) return matchId;

  // Outro request reservou o candidato primeiro: tenta novamente com os
  // candidatos restantes (o candidato perdido não é mais WAITING).
  return matchWithBestOpponent(
    seasonId,
    joinerUserId,
    joinerRating,
    excludeQueueId,
  );
}

// ---------- Fila de matchmaking ----------

export async function joinRankedQueue(userId: string) {
  const season = await getActiveSeason();
  const profile = await ensureProfile(userId, season.id);
  const now = new Date();

  await prisma.rankedQueueEntry.deleteMany({
    where: { status: 'WAITING', expiresAt: { lt: now } },
  });

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

  return { status: 'queued', queueId: entry.id };
}

export async function getRankedQueueStatus(userId: string) {
  const season = await getActiveSeason();
  const now = new Date();

  await prisma.rankedQueueEntry.deleteMany({
    where: { status: 'WAITING', expiresAt: { lt: now } },
  });

  const matched = await prisma.rankedQueueEntry.findFirst({
    where: { userId, seasonId: season.id, status: 'MATCHED' },
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
      await prisma.rankedQueueEntry.delete({ where: { id: waiting.id } });
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
  await prisma.rankedQueueEntry.deleteMany({
    where: { userId, seasonId: season.id, status: 'WAITING' },
  });
  return { status: 'left' };
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
  let match = await fetchMatch(matchId);
  if (!match || (match.player1Id !== userId && match.player2Id !== userId)) {
    throw new AppError('Partida ranqueada não encontrada.', 404);
  }
  if (match.status !== 'IN_PROGRESS') {
    throw new AppError('Esta partida ranqueada já foi encerrada.', 409);
  }

  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  if (!round) throw new AppError('Rodada não encontrada.', 404);
  if (round.roundNumber !== match.currentRoundNumber) {
    throw new AppError('Esta não é a rodada atual da partida.', 409);
  }
  if (round.resolvedAt) {
    throw new AppError('Esta rodada já foi encerrada.', 410);
  }

  const isPlayer1 = match.player1Id === userId;
  const now = new Date();

  if (now >= round.deadline) {
    await resolveRound(matchId, roundNumber, now);
    throw new AppError('O tempo da rodada esgotou.', 410);
  }
  if (isPlayer1 ? round.player1AnsweredAt : round.player2AnsweredAt) {
    throw new AppError('Você já respondeu esta rodada.', 409);
  }

  const location = await prisma.location.findUnique({
    where: { id: round.locationId },
  });
  if (!location) throw new AppError('Local não encontrado.', 404);

  const distanceMeters = haversineDistanceMeters(
    input.guessLatitude,
    input.guessLongitude,
    Number(location.latitude),
    Number(location.longitude),
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

  await prisma.rankedRound.update({
    where: { id: round.id },
    data: {
      ...answerData,
      ...(deadline.getTime() !== round.deadline.getTime() && { deadline }),
    },
  });

  const opponentAnswered = isPlayer1
    ? !!round.player2AnsweredAt
    : !!round.player1AnsweredAt;
  if (opponentAnswered) {
    await resolveRound(matchId, roundNumber, now);
  }

  match = await fetchMatch(matchId);
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

export async function listSeasons() {
  return prisma.season.findMany({ orderBy: { startsAt: 'desc' }, take: 100 });
}

async function endSeason(seasonId: string, endedAt: Date) {
  await prisma.season.update({
    where: { id: seasonId },
    data: { status: 'ENDED', endsAt: endedAt },
  });
  await prisma.rankedMatch.updateMany({
    where: { seasonId, status: 'IN_PROGRESS' },
    data: { status: 'ABANDONED', finishedAt: endedAt },
  });
}

export async function createSeason(input: CreateSeasonInput) {
  const now = new Date();

  const active = await prisma.season.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startsAt: 'desc' },
  });
  if (active) {
    await endSeason(active.id, now);
  }

  const total = await prisma.season.count();
  const name = input.name?.trim() || `Temporada ${total + 1}`;

  return prisma.season.create({
    data: { name, status: 'ACTIVE', startsAt: now },
  });
}

export async function endCurrentSeason() {
  const now = new Date();
  const active = await prisma.season.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startsAt: 'desc' },
  });
  if (!active)
    throw new AppError('Não há uma temporada ativa para encerrar.', 409);

  await endSeason(active.id, now);
  return { id: active.id, name: active.name, status: 'ENDED', endsAt: now };
}
