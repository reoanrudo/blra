CREATE EXTENSION IF NOT EXISTS pg_bigm;

CREATE INDEX idx_article_text ON "Article" USING gin (text gin_bigm_ops) WHERE "deletedAt" IS NULL;

CREATE INDEX idx_article_caption ON "Article" USING gin (caption gin_bigm_ops) WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX idx_article_unique ON "Article" ("lawId", level, "articleNumberNormalized") WHERE level = 'article' AND "deletedAt" IS NULL;
