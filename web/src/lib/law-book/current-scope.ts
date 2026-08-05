import { assertSafeSqlAlias } from "@/lib/law-book/sql-scope";

/**
 * 公開法令リーダー（法令一覧・本文・目次・検索）向けの Article スコープ SQL 断片。
 *
 * Task 11 で導入。LawBookEntry はカタログ所属（editionId, lawId）だけを表し、
 * 公開 Article は常に `Article.lawRevisionId = Law.currentRevisionId` で選択する。
 * この不変条件はカタログ Entry が旧 Revision を指していても維持される。
 *
 * - inclusionMode = 'full' の法令集掲載法令は全条項を公開。
 * - verifiedAt 未設定の抄録法令は互換のため全条項公開（移行期間）。
 * - verifiedAt 設定済みの抄録法令は公開範囲を Range 解決で絞り込む:
 *   1. LawBookEntryRangeResolution（durableNodeKey ベース・優先）
 *   2. LawBookEntryRange（stableNodeKey ベース・移行期 fallback）
 *   Task 9 の DB backfill が完了するまでは legacy Range で公開し、
 *   backfill 後は durable key 解決が優先される。
 *
 * legacy fallback について:
 * Task 9 の DB backfill（durableNodeKey/bodyChecksum/RangeResolution 生成）が
 * 未完了のため、過渡期として legacy Range（LawBookEntryRange）で公開する。
 * backfill 完了後は durable key ベースの RangeResolution が全ての検証済み抄録
 * 法令をカバーするため、この fallback ブロックは不要になる（削除手順は計画書
 * Task 15 を参照）。
 */
export function currentLawBookArticleScopeSql(
  articleAlias: string,
  entryAlias: string,
  lawAlias: string,
): string {
  assertSafeSqlAlias(articleAlias);
  assertSafeSqlAlias(entryAlias);
  assertSafeSqlAlias(lawAlias);
  return `(
    ${articleAlias}."lawId" = ${lawAlias}.id
    AND ${articleAlias}."lawRevisionId" = ${lawAlias}."currentRevisionId"
    AND ${articleAlias}."deletedAt" IS NULL
    AND (
      ${entryAlias}."inclusionMode" = 'full'
      OR ${entryAlias}."verifiedAt" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "LawBookEntryRangeResolution" resolution
        JOIN "LawBookEntryRange" included_range
          ON included_range.id = resolution."lawBookEntryRangeId"
        WHERE included_range."lawBookEntryId" = ${entryAlias}.id
          AND resolution."lawRevisionId" = ${lawAlias}."currentRevisionId"
          AND resolution.status = 'resolved'
          AND (
            resolution."startDurableNodeKey" IS NULL
            OR ${articleAlias}."durableNodeKey" = resolution."startDurableNodeKey"
            OR ${articleAlias}."durableNodeKey" LIKE resolution."startDurableNodeKey" || '/%'
          )
      )
      -- TODO(Task 9 backfill完了後): この legacy fallback ブロックは削除可能。
      -- durable key ベースの RangeResolution が全ての検証済み抄録法令をカバーした時点で不要になる。
      -- 削除手順は docs/superpowers/plans/2026-08-04-current-law-incremental-refresh.md の Task 15 参照。
      OR EXISTS (
        SELECT 1
        FROM "LawBookEntryRange" legacy_range
        WHERE legacy_range."lawBookEntryId" = ${entryAlias}.id
          AND legacy_range."verificationStatus" IN ('source_verified', 'structure_validated', 'link_validated', 'approved')
          AND (
            legacy_range."rangeType" = 'entire_document'
            OR (
              -- rangeType を 'article' のみに制限しているのは意図的。
              -- catalog版（lawBookCatalogArticleScopeSql）は chapter/section 等も
              -- 許容するが、current版の legacy fallback は過渡期の過小公開側（安全側）
              -- へ倒すため 'article' 単体範囲だけを公開する。start=end の単一条文に
              -- 限定することで、意図せず広い範囲が公開されるリスクを避ける。
              legacy_range."rangeType" = 'article'
              AND legacy_range."startStableNodeKey" IS NOT NULL
              AND legacy_range."startStableNodeKey" = legacy_range."endStableNodeKey"
              AND (
                ${articleAlias}."stableNodeKey" = legacy_range."startStableNodeKey"
                OR ${articleAlias}."stableNodeKey" LIKE legacy_range."startStableNodeKey" || '/%'
              )
            )
          )
      )
    )
  )`;
}
