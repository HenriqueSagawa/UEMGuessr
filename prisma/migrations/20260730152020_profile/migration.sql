-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarPublicId" TEXT,
ADD COLUMN     "bio" VARCHAR(280),
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "themeColor" VARCHAR(7);
