/** SQL alias として安全な文字列か検証する。英字始まりの英数字+アンダースコアのみ許容。 */
export function assertSafeSqlAlias(alias: string): void {
  const safeAlias = /^[a-z_][a-z0-9_]*$/i;
  if (!safeAlias.test(alias)) {
    throw new Error("SQL alias contains unsupported characters");
  }
}

/**
 * 固定書籍版（ksk-2026）検証用の Article スコープ SQL 断片。
 *
 * LawBookEntry と Article を `(lawId, lawRevisionId)` で直接結合し、
 * Entry が指す Revision 固定で公開範囲を判定する。書籍データの検証・backfill
 * スクリプト群（Task 12 で分類予定）でのみ使う。
 *
 * verifiedAt 未設定の抄録は移行中の互換表示、設定済みの抄録は Range 内だけを公開する。
 */
export function lawBookCatalogArticleScopeSql(
  articleAlias: string,
  entryAlias: string,
): string {
  assertSafeSqlAlias(articleAlias);
  assertSafeSqlAlias(entryAlias);

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

/**
 * @deprecated Task 11 で `lawBookCatalogArticleScopeSql` へ改名しました。
 * 公開リーダー（法令一覧・本文・目次・検索）では代わりに
 * `currentLawBookArticleScopeSql`（@/lib/law-book/current-scope）を使ってください。
 * 固定書籍版検証では `lawBookCatalogArticleScopeSql` を使います。
 *
 * Task 12 で全 consumer を分類し終えるまで、既存コードの型検査を壊さないために
 * 旧名の alias として残しています。
 */
export const lawBookArticleScopeSql = lawBookCatalogArticleScopeSql;
