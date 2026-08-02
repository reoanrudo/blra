-- AlterTable: ProjectProfile に conditions 列を追加
ALTER TABLE "ProjectProfile" ADD COLUMN "conditions" JSONB;

-- CreateTable: SectionRule
CREATE TABLE "SectionRule" (
    "id" SERIAL NOT NULL,
    "lawId" TEXT NOT NULL,
    "sectionStart" TEXT NOT NULL,
    "sectionEnd" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ArticleRule
CREATE TABLE "ArticleRule" (
    "id" SERIAL NOT NULL,
    "sectionRuleId" INTEGER NOT NULL,
    "articleId" TEXT,
    "articleRange" TEXT,
    "highlightLevel" TEXT NOT NULL,
    "cellRow" TEXT,
    "cellColumn" TEXT,
    "conditionKey" TEXT NOT NULL,
    "conditionValues" JSONB NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SectionRule_conditionType_idx" ON "SectionRule"("conditionType");
CREATE INDEX "SectionRule_lawId_idx" ON "SectionRule"("lawId");
CREATE INDEX "ArticleRule_sectionRuleId_idx" ON "ArticleRule"("sectionRuleId");
CREATE INDEX "ArticleRule_conditionKey_idx" ON "ArticleRule"("conditionKey");
CREATE INDEX "ArticleRule_articleId_idx" ON "ArticleRule"("articleId");

-- AddForeignKey
ALTER TABLE "SectionRule" ADD CONSTRAINT "SectionRule_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleRule" ADD CONSTRAINT "ArticleRule_sectionRuleId_fkey" FOREIGN KEY ("sectionRuleId") REFERENCES "SectionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleRule" ADD CONSTRAINT "ArticleRule_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw SQL: ArticleRule.conditionValues の JSONB GIN index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ArticleRule_conditionValues_gin"
  ON "ArticleRule" USING GIN ("conditionValues")
  WHERE "articleId" IS NOT NULL;
