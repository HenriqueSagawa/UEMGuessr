import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

export function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            status: "error",
            message: error.message,
        });
    }

    logger.error(error);
    
    return res.status(500).json({
        status: "error",
        message: "Erro interno do servidor",
    });
}