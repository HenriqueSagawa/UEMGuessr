import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { uploadImageBuffer, deleteImage } from "../../lib/cloudinaryUpload";
import type { CreateLocationInput, UpdateLocationInput, ListLocationsQuery } from "./locations.schemas";
 
export async function createLocation(
  input: CreateLocationInput,
  imageBuffer: Buffer,
  createdById: string,
) {
  const { url, publicId } = await uploadImageBuffer(imageBuffer);
 
  try {
    const location = await prisma.location.create({
      data: {
        name: input.name,
        description: input.description || null,
        latitude: input.latitude,
        longitude: input.longitude,
        imageUrl: url,
        imagePublicId: publicId,
        createdById,
      },
    });
 
    return location;
  } catch (error) {
    await deleteImage(publicId);
    throw error;
  }
}
 
export async function listLocations({ page, limit }: ListLocationsQuery) {
  const [items, total] = await prisma.$transaction([
    prisma.location.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.location.count(),
  ]);
 
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
 
export async function getLocationById(id: string) {
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) throw new AppError("Local não encontrado.", 404);
  return location;
}
 
export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
  imageBuffer: Buffer | null,
) {
  const existing = await getLocationById(id);
 
  let imageUrl = existing.imageUrl;
  let imagePublicId = existing.imagePublicId;
  const previousPublicId = existing.imagePublicId;
 
  if (imageBuffer) {
    const uploaded = await uploadImageBuffer(imageBuffer);
    imageUrl = uploaded.url;
    imagePublicId = uploaded.publicId;
  }
 
  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      imageUrl,
      imagePublicId,
    },
  });
 
  if (imageBuffer && previousPublicId) {
    await deleteImage(previousPublicId);
  }
 
  return location;
}
 
export async function deleteLocation(id: string) {
  const existing = await getLocationById(id);
 
  try {
    await prisma.location.delete({ where: { id } });
  } catch (error: unknown) {
    // P2003: violação de FK — o local já foi usado em alguma partida (Round)
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      throw new AppError(
        "Não é possível excluir este local: ele já foi usado em partidas registradas.",
        409,
      );
    }
    throw error;
  }
 
  if (existing.imagePublicId) {
    await deleteImage(existing.imagePublicId);
  }
}