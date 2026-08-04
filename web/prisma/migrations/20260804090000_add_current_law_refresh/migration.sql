-- CreateEnum
CREATE TYPE "LawRefreshTrigger" AS ENUM ('scheduled', 'manual');

-- CreateEnum
CREATE TYPE "LawRefreshRunStatus" AS ENUM ('running', 'succeeded', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "LawRefreshLawStatus" AS ENUM ('unchanged', 'updated', 'held', 'failed');

-- CreateEnum
CREATE TYPE "LawRefreshPhase" AS ENUM ('checking', 'fetching', 'parsing', 'diffing', 'verifying', 'activating', 'completed');

-- CreateEnum
CREATE TYPE "ArticleRevisionMappingKind" AS ENUM ('unchanged', 'modified', 'renumbered', 'removed');

-- CreateEnum
CREATE TYPE "ArticleRevisionMappingStatus" AS ENUM ('automatic', 'verified', 'ambiguous');

-- CreateEnum
CREATE TYPE "LawBookRangeResolutionStatus" AS ENUM ('resolved', 'blocked');

-- AlterTable
ALTER TABLE "LawRevision" ADD COLUMN     "repealDate" TIMESTAMP(3),
ADD COLUMN     "repealStatus" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "bodyChecksum" TEXT,
ADD COLUMN     "durableNodeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Article_lawRevisionId_durableNodeKey_key"
  ON "Article"("lawRevisionId", "durableNodeKey")
  WHERE "durableNodeKey" IS NOT NULL;

-- CreateTable
CREATE TABLE "LawRefreshRun" (
    "id" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "trigger" "LawRefreshTrigger" NOT NULL,
    "status" "LawRefreshRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "packageId" TEXT,

    CONSTRAINT "LawRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawRefreshLawResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "lawId" TEXT NOT NULL,
    "previousRevisionId" TEXT,
    "candidateRevisionId" TEXT,
    "observedVersionKey" TEXT,
    "status" "LawRefreshLawStatus" NOT NULL,
    "phase" "LawRefreshPhase" NOT NULL,
    "diffSummary" JSONB,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LawRefreshLawResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawSyncState" (
    "lawId" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulCheckAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3),
    "lastObservedVersionKey" TEXT,
    "lastEgovUpdatedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorDetail" TEXT,
    "repealStatus" TEXT,
    "repealDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LawSyncState_pkey" PRIMARY KEY ("lawId")
);

-- CreateTable
CREATE TABLE "ArticleRevisionMapping" (
    "id" TEXT NOT NULL,
    "lawId" TEXT NOT NULL,
    "fromRevisionId" TEXT NOT NULL,
    "toRevisionId" TEXT NOT NULL,
    "fromArticleId" TEXT NOT NULL,
    "toArticleId" TEXT,
    "kind" "ArticleRevisionMappingKind" NOT NULL,
    "status" "ArticleRevisionMappingStatus" NOT NULL,
    "method" TEXT NOT NULL,
    "rationale" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRevisionMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LawBookEntryRangeResolution" (
    "id" TEXT NOT NULL,
    "lawBookEntryRangeId" TEXT NOT NULL,
    "lawRevisionId" TEXT NOT NULL,
    "startDurableNodeKey" TEXT,
    "endDurableNodeKey" TEXT,
    "status" "LawBookRangeResolutionStatus" NOT NULL,
    "errorCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawBookEntryRangeResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LawRefreshRun_packageId_key" ON "LawRefreshRun"("packageId");

-- CreateIndex
CREATE INDEX "LawRefreshRun_targetDate_startedAt_idx" ON "LawRefreshRun"("targetDate", "startedAt");

-- CreateIndex
CREATE INDEX "LawRefreshLawResult_lawId_startedAt_idx" ON "LawRefreshLawResult"("lawId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LawRefreshLawResult_runId_lawId_key" ON "LawRefreshLawResult"("runId", "lawId");

-- CreateIndex
CREATE INDEX "ArticleRevisionMapping_fromArticleId_status_idx" ON "ArticleRevisionMapping"("fromArticleId", "status");

-- CreateIndex
CREATE INDEX "ArticleRevisionMapping_toArticleId_idx" ON "ArticleRevisionMapping"("toArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRevisionMapping_fromRevisionId_toRevisionId_fromArti_key" ON "ArticleRevisionMapping"("fromRevisionId", "toRevisionId", "fromArticleId");

-- CreateIndex
CREATE INDEX "LawBookEntryRangeResolution_lawRevisionId_status_idx" ON "LawBookEntryRangeResolution"("lawRevisionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LawBookEntryRangeResolution_lawBookEntryRangeId_lawRevision_key" ON "LawBookEntryRangeResolution"("lawBookEntryRangeId", "lawRevisionId");

-- AddForeignKey
ALTER TABLE "LawRefreshRun" ADD CONSTRAINT "LawRefreshRun_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "LawPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawRefreshLawResult" ADD CONSTRAINT "LawRefreshLawResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LawRefreshRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawRefreshLawResult" ADD CONSTRAINT "LawRefreshLawResult_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawSyncState" ADD CONSTRAINT "LawSyncState_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_fromRevisionId_fkey" FOREIGN KEY ("fromRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_toRevisionId_fkey" FOREIGN KEY ("toRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_fromArticleId_fkey" FOREIGN KEY ("fromArticleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_toArticleId_fkey" FOREIGN KEY ("toArticleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawBookEntryRangeResolution" ADD CONSTRAINT "LawBookEntryRangeResolution_lawBookEntryRangeId_fkey" FOREIGN KEY ("lawBookEntryRangeId") REFERENCES "LawBookEntryRange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawBookEntryRangeResolution" ADD CONSTRAINT "LawBookEntryRangeResolution_lawRevisionId_fkey" FOREIGN KEY ("lawRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
