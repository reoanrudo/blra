-- AlterTable
ALTER TABLE "ProjectProfile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false,
                           ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
