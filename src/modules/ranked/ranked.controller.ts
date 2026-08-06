import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/appError';
import {
  createSeasonSchema,
  leaderboardQuerySchema,
  roundNumberParamSchema,
} from './ranked.schemas';
import * as rankedService from './ranked.service';

function requireUserId(req: Request): string {
  if (!req.user) throw new AppError('Não autenticado.', 401);
  return req.user.id;
}

export async function joinQueue(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rankedService.joinRankedQueue(requireUserId(req));
    return res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function queueStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rankedService.getRankedQueueStatus(requireUserId(req));
    return res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function leaveQueue(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rankedService.leaveRankedQueue(requireUserId(req));
    return res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMatch(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const match = await rankedService.getRankedMatch(
      req.params.id as string,
      requireUserId(req),
    );
    return res.status(200).json({ status: 'success', data: match });
  } catch (error) {
    next(error);
  }
}

export async function answer(req: Request, res: Response, next: NextFunction) {
  try {
    const roundNumber = roundNumberParamSchema.parse(req.params.roundNumber);
    const result = await rankedService.submitRankedAnswer(
      req.params.id as string,
      requireUserId(req),
      roundNumber,
      req.body,
    );
    return res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return next(new AppError('Número da rodada inválido.', 422));
    }
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await rankedService.getRankedProfile(requireUserId(req));
    return res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function currentSeason(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rankedService.getRankedProfile(requireUserId(req));
    return res.status(200).json({ status: 'success', data: result });
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
    const query = leaderboardQuerySchema.parse(req.query);
    const result = await rankedService.getRankedLeaderboard(
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

export async function createSeason(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = createSeasonSchema.parse(req.body);
    const season = await rankedService.createSeason(input);
    return res.status(201).json({ status: 'success', data: season });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return next(new AppError('Dados da temporada inválidos.', 422));
    }
    next(error);
  }
}

export async function endSeason(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await rankedService.endCurrentSeason();
    return res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSeasons(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const seasons = await rankedService.listSeasons();
    return res.status(200).json({ status: 'success', data: seasons });
  } catch (error) {
    next(error);
  }
}
