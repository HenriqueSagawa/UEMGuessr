import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../utils/appError";
import { prisma } from "../config/prisma";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError("Token de acesso não informado.", 401));
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError("Token de acesso inválido ou expirado.", 401));
  }
}

export function requireRole(...roles: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Você não tem permissão para acessar este recurso.", 403));
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });
      if (!user || !roles.includes(user.role)) {
        return next(new AppError("Você não tem permissão para acessar este recurso.", 403));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
