-- CreateTable
CREATE TABLE "ArticleCooccurrence" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "cooccurCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleCooccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleCooccurrence_articleId_relatedId_key" ON "ArticleCooccurrence"("articleId", "relatedId");

-- CreateIndex
CREATE INDEX "ArticleCooccurrence_articleId_idx" ON "ArticleCooccurrence"("articleId");

-- CreateIndex
CREATE INDEX "ArticleCooccurrence_relatedId_idx" ON "ArticleCooccurrence"("relatedId");
