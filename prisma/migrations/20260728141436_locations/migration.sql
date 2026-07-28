-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "imagePublicId" TEXT;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
