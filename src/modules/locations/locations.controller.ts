import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/appError";
import { listLocationsQuerySchema } from "./locations.schemas";
import * as locationsService from "./locations.service";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError("A imagem do local é obrigatória.", 422);
    if (!req.user) throw new AppError("Não autenticado.", 401);

    const location = await locationsService.createLocation(req.body, req.file.buffer, req.user.id);

    return res.status(201).json({ status: "success", data: location });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listLocationsQuerySchema.parse(req.query);
    const result = await locationsService.listLocations(query);
    return res.status(200).json({ status: "success", data: result.items, pagination: result.pagination });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return next(new AppError("Parâmetros de paginação inválidos.", 422));
    }
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const location = await locationsService.getLocationById(req.params.id as string);
    return res.status(200).json({ status: "success", data: location });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const location = await locationsService.updateLocation(
      req.params.id as string,
      req.body,
      req.file?.buffer ?? null,
    );
    return res.status(200).json({ status: "success", data: location });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await locationsService.deleteLocation(req.params.id as string);
    return res.status(200).json({ status: "success", message: "Local excluído." });
  } catch (error) {
    next(error);
  }
}