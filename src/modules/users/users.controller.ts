import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/appError";
import * as usersService from "./user.service";

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Não autenticado.", 401);
    const profile = await usersService.getProfile(req.user.id);
    return res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Não autenticado.", 401);
    const profile = await usersService.updateProfile(req.user.id, req.body);
    return res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    next(error);
  }
}

export async function updateAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Não autenticado.", 401);
    if (!req.file) throw new AppError("Envie uma imagem para o campo 'avatar'.", 422);

    const profile = await usersService.updateAvatar(req.user.id, req.file.buffer);
    return res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    next(error);
  }
}

export async function removeAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError("Não autenticado.", 401);
    const profile = await usersService.removeAvatar(req.user.id);
    return res.status(200).json({ status: "success", data: profile });
  } catch (error) {
    next(error);
  }
}