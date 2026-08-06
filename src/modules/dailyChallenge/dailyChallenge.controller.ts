import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/appError';
import { listDailyChallengeLeaderboardQuerySchema } from './dailyChallenge.schemas';
import * as dailyChallengeService from './dailyChallenge.service';

function requireUserId(req: Request): string {
  if (!req.user) throw new AppError('Não autenticado.', 401);
  return req.user.id;
}

export async function getCurrent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const challenge = await dailyChallengeService.getCurrentDailyChallenge(
      requireUserId(req),
    );
    return res.status(200).json({ status: 'success', data: challenge });
  } catch (error) {
    next(error);
  }
}

export async function start(req: Request, res: Response, next: NextFunction) {
  try {
    const attempt = await dailyChallengeService.startDailyChallenge(
      req.params.id as string,
      requireUserId(req),
    );
    return res.status(200).json({ status: 'success', data: attempt });
  } catch (error) {
    next(error);
  }
}

export async function submitGuess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await dailyChallengeService.submitDailyChallengeGuess(
      req.params.id as string,
      requireUserId(req),
      req.body,
    );
    return res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function leaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = listDailyChallengeLeaderboardQuerySchema.parse(req.query);
    const result = await dailyChallengeService.getDailyChallengeLeaderboard(
      req.params.id as string,
      requireUserId(req),
      query.limit,
    );
    return res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return next(new AppError('Parâmetros de paginação inválidos.', 422));
    }
    next(error);
  }
}
