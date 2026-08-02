CREATE TYPE "ApplicabilityAnchorType" AS ENUM (
  'TODAY',
  'CONFIRMATION_APPLICATION',
  'CONSTRUCTION_START',
  'EXISTING_BUILDING_ORIGIN',
  'CUSTOM'
);

ALTER TABLE "ArticleAnnotation"
  ADD COLUMN "applicabilityAnchor" "ApplicabilityAnchorType",
  ADD COLUMN "applicabilityDate" DATE,
  ADD COLUMN "snapshotLawRevisionId" TEXT;

ALTER TABLE "UserHighlight"
  ADD COLUMN "applicabilityAnchor" "ApplicabilityAnchorType",
  ADD COLUMN "applicabilityDate" DATE,
  ADD COLUMN "snapshotLawRevisionId" TEXT;

ALTER TABLE "CheckItem"
  ADD COLUMN "applicabilityAnchor" "ApplicabilityAnchorType",
  ADD COLUMN "applicabilityDate" DATE,
  ADD COLUMN "snapshotLawRevisionId" TEXT;

CREATE INDEX "ArticleAnnotation_snapshotLawRevisionId_idx"
  ON "ArticleAnnotation"("snapshotLawRevisionId");
CREATE INDEX "UserHighlight_snapshotLawRevisionId_idx"
  ON "UserHighlight"("snapshotLawRevisionId");
CREATE INDEX "CheckItem_snapshotLawRevisionId_idx"
  ON "CheckItem"("snapshotLawRevisionId");
