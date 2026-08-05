import { normalizeArticleNumber } from "@/lib/article/normalize-article";
import type { ParsedLawNode } from "./types";

/**
 * 書籍収載範囲（LawBookEntryRange）を候補 Revision のノード群へ解決する。
 *
 * 本モジュールは純粋な計算ロジックであり、DB や副作用には触れない。
 * 入力は Prisma モデル `LawBookEntryRange` と同じ形状のオブジェクトを想定するが、
 * 呼び出し側（テスト含む）はインメモリのオブジェクトを渡してよい。
 *
 * 解決結果は `LawBookEntryRangeResolution` 行へ書き込むことを想定した DTO であり、
 * 元の `LawBookEntryRange.startStableNodeKey/endStableNodeKey` は更新しない。
 * これは書籍版の固定参照キーを保護し、現行 Revision のみ durability を追従させるため。
 */

/**
 * Prisma モデル `LawBookEntryRange.rangeType` の取りうる値の部分集合。
 * 検証対象は article / entire_document のみ。それ以外は呼び出し側で事前に
 * フィルタするか、このモジュールへ渡した時点で `entire_document` と同等に扱う。
 */
export type LawBookRangeType =
  | "article"
  | "paragraph"
  | "item"
  | "supplementary"
  | "appendix"
  | "table"
  | "entire_document";

/**
 * 範囲解決の入力。Prisma モデル `LawBookEntryRange` の形状に合わせる。
 * `startStableNodeKey/endStableNodeKey` は旧書籍版の固定キーであり、
 * このモジュールでは読み込むだけで書き換えない。
 */
export interface LawBookEntryRangeInput {
  id: string;
  rangeType: LawBookRangeType;
  startStableNodeKey?: string | null;
  endStableNodeKey?: string | null;
  officialCitationStart?: string | null;
  officialCitationEnd?: string | null;
}

/**
 * 範囲解決の結果。Prisma モデル `LawBookEntryRangeResolution` の形状に合わせる。
 */
export interface RangeResolutionResult {
  rangeId: string;
  status: "resolved" | "blocked";
  startDurableNodeKey: string | null;
  endDurableNodeKey: string | null;
  errorCode: string | null;
}

/**
 * 公式引用文字列（例: "第206条", "第213条の2"）を parser が付与する
 * `articleNumberNormalized`（例: "206", "213の2"）と同じ形式へ正規化する。
 *
 * parser 内部では ArticleTitle から「第...条」を除去した後に
 * `normalizeArticleNumber`（漢数字→算用数字 + 「の」分割）を適用している。
 * このモジュールでは外部から渡される公式引用（「第」「条」を含む）を受け取るため、
 * 同等の前処理を行ってから `normalizeArticleNumber` へ委譲する。
 * parser 独自の正規化関数は再実装せず、既存のものを再利用する。
 */
export function normalizeCitationToArticleNumber(
  citation: string | null | undefined,
): string | null {
  if (!citation) return null;
  const trimmed = citation.trim();
  if (!trimmed) return null;
  // parser は ArticleTitle に対し `replace(/^第/, "").replace(/条/g, "")` で
  // 「第」「条」を除去した後に normalizeArticleNumber を適用する。これと同じ前処理で
  // 公式引用（「第213条の2」「第二百六条」等）を内部表現へ揃える。
  //   "第213条の2" -> "213の2"
  //   "第二百六条" -> "二百六" -> "206"
  //   "206"        -> "206"（そのまま）
  const inner = trimmed.replace(/^第/, "").replaceAll("条", "").trim();
  if (!inner) return null;
  const normalized = normalizeArticleNumber(inner);
  return normalized ?? inner;
}

function findArticleNodesByNumber(
  nodes: readonly ParsedLawNode[],
  normalizedNumber: string,
): ParsedLawNode[] {
  const matches: ParsedLawNode[] = [];
  for (const node of nodes) {
    if (node.level !== "article") continue;
    if (node.articleNumberNormalized === normalizedNumber) {
      matches.push(node);
    }
  }
  return matches;
}

/**
 * 1 つの引用番号を候補ノード群へ解決する。
 * 0 件 → NOT_FOUND、複数件 → AMBIGUOUS、1 件 → resolved。
 */
function resolveEndpoint(
  nodes: readonly ParsedLawNode[],
  citation: string | null | undefined,
): { node: ParsedLawNode | null; errorCode: string | null } {
  const normalized = normalizeCitationToArticleNumber(citation);
  if (!normalized) {
    return { node: null, errorCode: "VERIFIED_RANGE_NOT_FOUND" };
  }
  const matches = findArticleNodesByNumber(nodes, normalized);
  if (matches.length === 0) {
    return { node: null, errorCode: "VERIFIED_RANGE_NOT_FOUND" };
  }
  if (matches.length > 1) {
    return { node: null, errorCode: "VERIFIED_RANGE_AMBIGUOUS" };
  }
  return { node: matches[0]!, errorCode: null };
}

/**
 * 書籍収載範囲の一覧を候補 Revision のノード群へ解決する。
 *
 * - `rangeType === "entire_document"` のとき、ノードが1件以上存在すれば
 *   root 全体として resolved とし、start/end には先頭・末尾ノードの
 *   durableNodeKey を設定する。ノードが0件のときは NOT_FOUND で blocked。
 * - `rangeType === "article"` のとき、`officialCitationStart/End` を正規化し、
 *   `level === "article"` のノードの `articleNumberNormalized` へ完全一致させる。
 *   start/end それぞれで 0件または複数件マッチした場合は blocked。
 *   end が省略された場合は start と同一ノードを end として扱う。
 * - それ以外の rangeType（paragraph/item/supplementary/appendix/table）は
 *   現状の検証要件では範囲解決対象外だが、ノードが1件以上あれば
 *   entire_document と同等に resolved として扱う（恒久拒否しない）。
 *
 * 元の `LawBookEntryRange.startStableNodeKey/endStableNodeKey` は更新しない。
 */
export function resolveVerifiedRanges(
  ranges: readonly LawBookEntryRangeInput[],
  nodes: readonly ParsedLawNode[],
): RangeResolutionResult[] {
  const results: RangeResolutionResult[] = [];

  for (const range of ranges) {
    if (range.rangeType === "entire_document") {
      if (nodes.length === 0) {
        results.push({
          rangeId: range.id,
          status: "blocked",
          startDurableNodeKey: null,
          endDurableNodeKey: null,
          errorCode: "VERIFIED_RANGE_NOT_FOUND",
        });
      } else {
        results.push({
          rangeId: range.id,
          status: "resolved",
          startDurableNodeKey: nodes[0]!.durableNodeKey,
          endDurableNodeKey: nodes[nodes.length - 1]!.durableNodeKey,
          errorCode: null,
        });
      }
      continue;
    }

    if (range.rangeType === "article") {
      const start = resolveEndpoint(nodes, range.officialCitationStart);
      if (start.errorCode || !start.node) {
        results.push({
          rangeId: range.id,
          status: "blocked",
          startDurableNodeKey: null,
          endDurableNodeKey: null,
          errorCode: start.errorCode,
        });
        continue;
      }
      // end が省略された場合は start と同一番号で解決する。
      const endCitation =
        range.officialCitationEnd ?? range.officialCitationStart;
      const end = resolveEndpoint(nodes, endCitation);
      if (end.errorCode || !end.node) {
        results.push({
          rangeId: range.id,
          status: "blocked",
          startDurableNodeKey: null,
          endDurableNodeKey: null,
          errorCode: end.errorCode,
        });
        continue;
      }
      results.push({
        rangeId: range.id,
        status: "resolved",
        startDurableNodeKey: start.node.durableNodeKey,
        endDurableNodeKey: end.node.durableNodeKey,
        errorCode: null,
      });
      continue;
    }

    // paragraph / item / supplementary / appendix / table は現行検証要件では
    // 詳細解決対象外。ノードが存在すれば resolved、なければ NOT_FOUND で blocked。
    if (nodes.length === 0) {
      results.push({
        rangeId: range.id,
        status: "blocked",
        startDurableNodeKey: null,
        endDurableNodeKey: null,
        errorCode: "VERIFIED_RANGE_NOT_FOUND",
      });
    } else {
      results.push({
        rangeId: range.id,
        status: "resolved",
        startDurableNodeKey: nodes[0]!.durableNodeKey,
        endDurableNodeKey: nodes[nodes.length - 1]!.durableNodeKey,
        errorCode: null,
      });
    }
  }

  return results;
}
