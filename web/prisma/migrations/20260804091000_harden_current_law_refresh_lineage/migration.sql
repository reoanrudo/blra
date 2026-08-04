-- DropForeignKey
ALTER TABLE "ArticleRevisionMapping" DROP CONSTRAINT "ArticleRevisionMapping_fromArticleId_fkey";

-- DropForeignKey
ALTER TABLE "ArticleRevisionMapping" DROP CONSTRAINT "ArticleRevisionMapping_fromRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "ArticleRevisionMapping" DROP CONSTRAINT "ArticleRevisionMapping_toArticleId_fkey";

-- DropForeignKey
ALTER TABLE "ArticleRevisionMapping" DROP CONSTRAINT "ArticleRevisionMapping_toRevisionId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Article_id_lawRevisionId_lawId_key" ON "Article"("id", "lawRevisionId", "lawId");

-- CreateIndex
CREATE UNIQUE INDEX "LawRevision_id_lawId_key" ON "LawRevision"("id", "lawId");

-- AddForeignKey
ALTER TABLE "LawRefreshLawResult" ADD CONSTRAINT "LawRefreshLawResult_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LawRefreshLawResult" ADD CONSTRAINT "LawRefreshLawResult_candidateRevisionId_fkey" FOREIGN KEY ("candidateRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_fromRevisionId_lawId_fkey" FOREIGN KEY ("fromRevisionId", "lawId") REFERENCES "LawRevision"("id", "lawId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_toRevisionId_lawId_fkey" FOREIGN KEY ("toRevisionId", "lawId") REFERENCES "LawRevision"("id", "lawId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_fromArticleId_fromRevisionId_lawId_fkey" FOREIGN KEY ("fromArticleId", "fromRevisionId", "lawId") REFERENCES "Article"("id", "lawRevisionId", "lawId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRevisionMapping" ADD CONSTRAINT "ArticleRevisionMapping_toArticleId_toRevisionId_lawId_fkey" FOREIGN KEY ("toArticleId", "toRevisionId", "lawId") REFERENCES "Article"("id", "lawRevisionId", "lawId") ON DELETE RESTRICT ON UPDATE CASCADE;
