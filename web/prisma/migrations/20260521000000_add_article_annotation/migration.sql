-- CreateEnum
CREATE TYPE "AnnotationTag" AS ENUM ('applicable', 'review', 'reference');

-- CreateTable
CREATE TABLE "ArticleAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "projectId" TEXT,
    "tag" "AnnotationTag" NOT NULL DEFAULT 'review',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAnnotation_userId_articleId_key" ON "ArticleAnnotation"("userId", "articleId");
CREATE INDEX "ArticleAnnotation_articleId_idx" ON "ArticleAnnotation"("articleId");
CREATE INDEX "ArticleAnnotation_projectId_idx" ON "ArticleAnnotation"("projectId");
CREATE INDEX "ArticleAnnotation_tag_idx" ON "ArticleAnnotation"("tag");

-- AddForeignKey
ALTER TABLE "ArticleAnnotation" ADD CONSTRAINT "ArticleAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleAnnotation" ADD CONSTRAINT "ArticleAnnotation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArticleAnnotation" ADD CONSTRAINT "ArticleAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ProjectProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
