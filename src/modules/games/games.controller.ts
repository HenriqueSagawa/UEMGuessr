import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/appError";
import { listGamesQuerySchema } from "./games.schemas";
import * as gamesService from "./games.service";

function requireUserId(req: Request): string {
  if (!req.user) throw new AppError("Não autenticado.", 401);
  return req.user.id;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const game = await gamesService.createGame(requireUserId(req));
    return res.status(201).json({ status: "success", data: game });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listGamesQuerySchema.parse(req.query);
    const result = await gamesService.listGames(requireUserId(req), query);
    return res
      .status(200)
      .json({ status: "success", data: result.items, pagination: result.pagination });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return next(new AppError("Parâmetros de paginação inválidos.", 422));
    }
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const game = await gamesService.getGameById(req.params.id as string, requireUserId(req));
    return res.status(200).json({ status: "success", data: game });
  } catch (error) {
    next(error);
  }
}

export async function nextRound(req: Request, res: Response, next: NextFunction) {
  try {
    const round = await gamesService.getNextRound(req.params.id as string, requireUserId(req));
    return res.status(200).json({ status: "success", data: round });
  } catch (error) {
    next(error);
  }
}

export async function submitGuess(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await gamesService.submitGuess(
      req.params.id as string,
      requireUserId(req),
      req.body,
    );
    return res.status(201).json({ status: "success", data: result });
  } catch (error) {
    next(error);
  }
}

export async function finish(req: Request, res: Response, next: NextFunction) {
  try {
    const game = await gamesService.finishGame(req.params.id as string, requireUserId(req));
    return res.status(200).json({ status: "success", data: game });
  } catch (error) {
    next(error);
  }
}