import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { uploadAvatarImageBuffer, deleteImage } from "../../lib/cloudinaryUpload";
import type { UpdateProfileInput } from "./users.schemas";

function profileDTO(user: {
  id: string;
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  displayName: string | null;
  bio: string | null;
  themeColor: string | null;
  emailVerified: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    bio: user.bio,
    themeColor: user.themeColor,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 404);
  return profileDTO(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 404);

  if (input.username && input.username !== user.username) {
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new AppError("Este nome de usuário já está em uso.", 409);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.username !== undefined && { username: input.username }),
      ...(input.displayName !== undefined && { displayName: input.displayName || null }),
      ...(input.bio !== undefined && { bio: input.bio || null }),
      ...(input.themeColor !== undefined && { themeColor: input.themeColor || null }),
    },
  });

  return profileDTO(updated);
}

export async function updateAvatar(userId: string, imageBuffer: Buffer) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 404);

  const { url, publicId } = await uploadAvatarImageBuffer(imageBuffer);
  const previousPublicId = user.avatarPublicId;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url, avatarPublicId: publicId },
    });

    if (previousPublicId) {
      await deleteImage(previousPublicId);
    }

    return profileDTO(updated);
  } catch (error) {
    await deleteImage(publicId);
    throw error;
  }
}

export async function removeAvatar(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Usuário não encontrado.", 404);

  if (user.avatarPublicId) {
    await deleteImage(user.avatarPublicId);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null, avatarPublicId: null },
  });

  return profileDTO(updated);
}