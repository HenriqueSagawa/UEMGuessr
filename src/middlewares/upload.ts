import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new AppError("Formato de imagem inválido. Use JPEG, PNG ou WebP.", 422) as unknown as Error);
  }
  cb(null, true);
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
}).single("image");
 
export function uploadLocationImage(req: Request, res: Response, next: NextFunction) {
  multerUpload(req, res, (error: unknown) => {
    if (!error) return next();
 
    if (error instanceof AppError) return next(error);
 
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError("A imagem não pode passar de 5MB.", 422));
    }
 
    return next(new AppError("Falha ao processar o upload da imagem.", 422));
  });
}