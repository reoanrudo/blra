-- 建築基準法関係法令集2026年版の収録台帳と、既存Articleの初期Revisionを追加する。
-- 既存Article.idは変更しないため、ハイライト・注釈・チェック根拠の外部キーを維持する。

CREATE TYPE "LawPackageStatus" AS ENUM ('draft', 'verified', 'scheduled', 'published', 'rejected');
CREATE TYPE "LawRevisionStatus" AS ENUM ('staged', 'scheduled', 'active', 'superseded', 'rejected');
CREATE TYPE "LawBookEditionStatus" AS ENUM ('draft', 'validating', 'approved', 'published', 'withdrawn');
CREATE TYPE "LawBookInclusionMode" AS ENUM ('full', 'excerpt');
CREATE TYPE "LawBookVerificationStatus" AS ENUM ('planned', 'source_verified', 'ingested', 'structure_validated', 'link_validated', 'approved', 'blocked');
CREATE TYPE "LawBookRangeType" AS ENUM ('article', 'paragraph', 'item', 'supplementary', 'appendix', 'table', 'entire_document');

ALTER TABLE "Law"
  ADD COLUMN "currentRevisionId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "LawPackage" (
  "id" TEXT NOT NULL,
  "packageVersion" TEXT NOT NULL,
  "manifestChecksum" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "signerKeyId" TEXT NOT NULL,
  "sourceSummary" JSONB NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "status" "LawPackageStatus" NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LawPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LawPackage_packageVersion_key" ON "LawPackage"("packageVersion");
CREATE INDEX "LawPackage_status_effectiveAt_idx" ON "LawPackage"("status", "effectiveAt");

CREATE TABLE "LawRevision" (
  "id" TEXT NOT NULL,
  "lawId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "officialVersionKey" TEXT NOT NULL,
  "promulgationDate" TIMESTAMP(3),
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "xmlStorageKey" TEXT NOT NULL,
  "xmlChecksum" TEXT NOT NULL,
  "status" "LawRevisionStatus" NOT NULL DEFAULT 'staged',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LawRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LawRevision_lawId_officialVersionKey_key" ON "LawRevision"("lawId", "officialVersionKey");
CREATE INDEX "LawRevision_lawId_status_effectiveFrom_idx" ON "LawRevision"("lawId", "status", "effectiveFrom");
CREATE INDEX "LawRevision_packageId_idx" ON "LawRevision"("packageId");

ALTER TABLE "LawRevision"
  ADD CONSTRAINT "LawRevision_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LawRevision_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "LawPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "LawPackage" (
  "id", "packageVersion", "manifestChecksum", "signature", "signerKeyId",
  "sourceSummary", "effectiveAt", "status"
) VALUES (
  'pkg_legacy_initial',
  'legacy-initial-2026-01-01',
  'legacy-unverified',
  'legacy-unverified',
  'local-migration',
  '{"kind":"legacy_backfill","verification":"required"}'::jsonb,
  TIMESTAMP '2026-01-01 00:00:00',
  'draft'
);

INSERT INTO "LawRevision" (
  "id", "lawId", "packageId", "officialVersionKey", "effectiveFrom", "fetchedAt",
  "sourceUrl", "xmlStorageKey", "xmlChecksum", "status"
)
SELECT
  'rev_legacy_' || l."egovLawId",
  l."id",
  'pkg_legacy_initial',
  'legacy-2026-01-01',
  TIMESTAMP '2026-01-01 00:00:00',
  CURRENT_TIMESTAMP,
  'https://laws.e-gov.go.jp/api/2/law_file/xml/' || l."egovLawId" || '?asof=2026-01-01',
  'spikes/001-xml-parse/data/' || l."egovLawId" || '.xml',
  'legacy-unverified',
  'staged'
FROM "Law" l;

ALTER TABLE "Article"
  ADD COLUMN "lawRevisionId" TEXT,
  ADD COLUMN "stableNodeKey" TEXT,
  ADD COLUMN "contentChecksum" TEXT;

UPDATE "Article" a
SET
  "lawRevisionId" = 'rev_legacy_' || l."egovLawId",
  "stableNodeKey" = 'legacy:' || a."id",
  "contentChecksum" = md5(
    concat_ws('|', a."level"::text, a."articleNumberNormalized", a."paragraphNumber", a."itemNumber", a."subitemNumber", a."title", a."caption", a."text")
  )
FROM "Law" l
WHERE l."id" = a."lawId";

ALTER TABLE "Article"
  ALTER COLUMN "lawRevisionId" SET NOT NULL,
  ALTER COLUMN "stableNodeKey" SET NOT NULL,
  ALTER COLUMN "contentChecksum" SET NOT NULL;

CREATE UNIQUE INDEX "Article_lawRevisionId_stableNodeKey_key" ON "Article"("lawRevisionId", "stableNodeKey");
CREATE INDEX "Article_lawRevisionId_parentId_sortOrder_idx" ON "Article"("lawRevisionId", "parentId", "sortOrder");
CREATE INDEX "Article_lawId_lawRevisionId_level_articleNumberNormalized_idx" ON "Article"("lawId", "lawRevisionId", "level", "articleNumberNormalized");

ALTER TABLE "Article"
  ADD CONSTRAINT "Article_lawRevisionId_fkey" FOREIGN KEY ("lawRevisionId") REFERENCES "LawRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "Law" l
SET "currentRevisionId" = r."id"
FROM "LawRevision" r
WHERE r."lawId" = l."id";

CREATE UNIQUE INDEX "Law_currentRevisionId_key" ON "Law"("currentRevisionId");
ALTER TABLE "Law"
  ADD CONSTRAINT "Law_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "LawRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LawBookEdition" (
  "id" TEXT NOT NULL,
  "editionKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "editionYear" INTEGER NOT NULL,
  "isbn" TEXT NOT NULL,
  "publisher" TEXT NOT NULL,
  "bookPublishedAt" TIMESTAMP(3) NOT NULL,
  "effectiveAsOf" TIMESTAMP(3) NOT NULL,
  "manifestVersion" TEXT NOT NULL,
  "manifestChecksum" TEXT NOT NULL,
  "catalogEvidenceStorageKey" TEXT,
  "catalogEvidenceChecksum" TEXT,
  "status" "LawBookEditionStatus" NOT NULL DEFAULT 'draft',
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LawBookEdition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LawBookEdition_editionKey_key" ON "LawBookEdition"("editionKey");
CREATE UNIQUE INDEX "LawBookEdition_publisher_editionYear_isbn_key" ON "LawBookEdition"("publisher", "editionYear", "isbn");
CREATE INDEX "LawBookEdition_status_editionYear_idx" ON "LawBookEdition"("status", "editionYear");

CREATE TABLE "LawBookEntry" (
  "id" TEXT NOT NULL,
  "editionId" TEXT NOT NULL,
  "lawId" TEXT NOT NULL,
  "lawRevisionId" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "sectionName" TEXT,
  "inclusionMode" "LawBookInclusionMode" NOT NULL,
  "printedTitle" TEXT NOT NULL,
  "printedPage" INTEGER NOT NULL,
  "catalogSourceLocator" TEXT NOT NULL,
  "verificationStatus" "LawBookVerificationStatus" NOT NULL DEFAULT 'planned',
  "verificationNote" TEXT,
  "sourceUrl" TEXT,
  "sourceStorageKey" TEXT,
  "sourceChecksum" TEXT,
  "sourceFetchedAt" TIMESTAMP(3),
  "articleCount" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "verifiedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LawBookEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LawBookEntry_editionId_lawId_key" ON "LawBookEntry"("editionId", "lawId");
CREATE UNIQUE INDEX "LawBookEntry_editionId_displayOrder_key" ON "LawBookEntry"("editionId", "displayOrder");
CREATE INDEX "LawBookEntry_editionId_verificationStatus_idx" ON "LawBookEntry"("editionId", "verificationStatus");
CREATE INDEX "LawBookEntry_lawRevisionId_idx" ON "LawBookEntry"("lawRevisionId");

ALTER TABLE "LawBookEntry"
  ADD CONSTRAINT "LawBookEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "LawBookEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LawBookEntry_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LawBookEntry_lawRevisionId_fkey" FOREIGN KEY ("lawRevisionId") REFERENCES "LawRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LawBookEntryRange" (
  "id" TEXT NOT NULL,
  "lawBookEntryId" TEXT NOT NULL,
  "rangeType" "LawBookRangeType" NOT NULL,
  "startStableNodeKey" TEXT,
  "endStableNodeKey" TEXT,
  "officialCitationStart" TEXT,
  "officialCitationEnd" TEXT,
  "inclusionReason" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "verificationStatus" "LawBookVerificationStatus" NOT NULL DEFAULT 'planned',
  "verifiedAt" TIMESTAMP(3),
  "verifiedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LawBookEntryRange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LawBookEntryRange_lawBookEntryId_sortOrder_key" ON "LawBookEntryRange"("lawBookEntryId", "sortOrder");
CREATE INDEX "LawBookEntryRange_lawBookEntryId_verificationStatus_idx" ON "LawBookEntryRange"("lawBookEntryId", "verificationStatus");

ALTER TABLE "LawBookEntryRange"
  ADD CONSTRAINT "LawBookEntryRange_lawBookEntryId_fkey" FOREIGN KEY ("lawBookEntryId") REFERENCES "LawBookEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
