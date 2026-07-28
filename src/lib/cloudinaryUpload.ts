import { cloudinary } from "../config/cloudinary";
import { AppError } from "../utils/appError";

const LOCATIONS_FOLDER = "locations";

export interface UploadedImage {
  url: string;
  publicId: string;
}

export function uploadImageBuffer(buffer: Buffer): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: LOCATIONS_FOLDER,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          console.error("Cloudinary upload error:", error);
          return reject(new AppError("Falha ao enviar a imagem para o Cloudinary.", 502));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    uploadStream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId).catch(() => {
  });
}