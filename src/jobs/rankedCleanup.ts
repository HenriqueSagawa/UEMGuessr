import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { resolveRound } from '../modules/ranked/ranked.service';

const CLEANUP_INTERVAL_MS = 60 * 1000;

export async function runRankedCleanup() {
  const now = new Date();

  const pendingMatches = await prisma.rankedMatch.findMany({
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

  for (const match of pendingMatches) {
    const pending = match.rounds[0];
    if (!pending || pending.deadline >= now) continue;
    try {
      await resolveRound(match.id, pending.roundNumber, now);
    } catch (error) {
      logger.error(
        { error, matchId: match.id, roundNumber: pending.roundNumber },
        'Falha ao resolver rodada ranqueada expirada.',
      );
    }
  }

  try {
    const deleted = await prisma.rankedQueueEntry.deleteMany({
      where: { status: 'WAITING', expiresAt: { lt: now } },
    });
    if (deleted.count > 0) {
      logger.debug(
        { deleted: deleted.count },
        'Entradas de fila ranqueada expiradas removidas.',
      );
    }
  } catch (error) {
    logger.error(
      error,
      'Falha ao limpar entradas de fila ranqueada expiradas.',
    );
  }
}

let cleanupTimer: NodeJS.Timeout | null = null;

export function startRankedCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    runRankedCleanup().catch((error) => {
      logger.error(error, 'Falha ao executar limpeza ranqueada.');
    });
  }, CLEANUP_INTERVAL_MS);
}

export function stopRankedCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
