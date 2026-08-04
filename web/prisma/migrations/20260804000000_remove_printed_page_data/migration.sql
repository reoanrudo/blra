ALTER TABLE "LawBookEntry" DROP COLUMN "printedPage";

UPDATE "LawBookEntry"
SET "catalogSourceLocator" = '総目次'
WHERE "catalogSourceLocator" LIKE '総目次 p.%';

UPDATE "LawBookEntryRange"
SET "inclusionReason" = regexp_replace(
  "inclusionReason",
  '^紙面p\.[^（]+',
  '検証画像'
)
WHERE "inclusionReason" ~ '^紙面p\.';

UPDATE "LawBookEntry"
SET "verificationNote" = '収録範囲照合済み。掲載61条を個別Range化。第638条から第640条までは原典上「削除」表示のためArticle Rangeなし。'
WHERE "verificationNote" LIKE '紙面p.%照合済み。%';
