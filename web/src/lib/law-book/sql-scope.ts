/**
 * 選択Edition内でArticleを通常公開できるか判定するSQL断片。
 * verifiedAt未設定の抄録は移行中の互換表示、設定済みの抄録はRange内だけを公開する。
 */
export function lawBookArticleScopeSql(articleAlias: string, entryAlias: string): string {
  const safeAlias = /^[a-z_][a-z0-9_]*$/i;
  if (!safeAlias.test(articleAlias) || !safeAlias.test(entryAlias)) {
    throw new Error("SQL alias contains unsupported characters");
  }

  return `(
    ${entryAlias}."inclusionMode" = 'full'
    OR ${entryAlias}."verifiedAt" IS NULL
    OR EXISTS (
      SELECT 1
      FROM "LawBookEntryRange" included_range
      WHERE included_range."lawBookEntryId" = ${entryAlias}.id
        AND included_range."verificationStatus" IN ('source_verified', 'structure_validated', 'link_validated', 'approved')
        AND (
          included_range."rangeType" = 'entire_document'
          OR (
            included_range."rangeType" = 'article'
            AND included_range."startStableNodeKey" IS NOT NULL
            AND included_range."startStableNodeKey" = included_range."endStableNodeKey"
            AND (
              ${articleAlias}."stableNodeKey" = included_range."startStableNodeKey"
              OR ${articleAlias}."stableNodeKey" LIKE included_range."startStableNodeKey" || '/%'
            )
          )
        )
    )
  )`;
}

