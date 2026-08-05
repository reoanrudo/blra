/**
 * 法令リビジョン差分から変更通知バナー用のサマリーを構築するユーティリティ。
 *
 * refresh-service が計算した LawRevisionDiff を、DB保存用の JSON シリアライザブルな
 * 形へ変換する。UI 層はこの JSON を経由して変更通知バナーを表示する。
 *
 * 設計書 §13.2「変更通知バナー」に基づく。
 */

import type { LawNodeDiff, LawRevisionDiff } from "./diff-law-revisions";

/**
 * 変更通知バナーの表示条件を満たす差分種別。
 * renumbered_candidate / ambiguous は held 扱いのため、バナーへ出さない
 * （held になった時点で activate されないため、実質的に updated では現れない）。
 */
const CHANGE_KINDS = new Set<LawNodeDiff["kind"]>([
  "modified",
  "added",
  "removed",
]);

/**
 * DB保存用の差分サマリー（LawRefreshLawResult.diffSummary へ格納）。
 * verify 用の内部エラー情報は含まず、UI 表示に必要な情報のみ。
 */
export interface DiffSummary {
  /** 差分件数の集計。 */
  counts: LawRevisionDiff["counts"];
  /**
   * 変更があった条番号のリスト（例: ["第6条", "第12条", "第48条"]）。
   * article レベルのノードのみを対象とし、重複を排除して sortOrder 順に並ぶ。
   * 初回導入（previousRevisionId が null）の場合は空配列。
   */
  changedArticleNumbers: string[];
}

/**
 * 差分アイテムから条番号ラベルを抽出する。
 * article レベルのノードのみを対象とし、articleNumber が null の場合は対象外。
 */
function extractArticleNumber(diff: LawNodeDiff): string | null {
  const node = diff.candidate ?? diff.previous;
  if (!node || node.level !== "article") return null;
  if (!node.articleNumber) return null;
  return node.articleNumber;
}

/**
 * LawRevisionDiff から DB保存用の DiffSummary を構築する。
 *
 * @param diff - diff engine が計算した差分
 * @param isFirstImport - 初回導入（previousRevisionId が null）かどうか。
 *   初回導入の場合は changedArticleNumbers を空にする（設計書 §13.2 の非表示条件）。
 */
export function buildDiffSummary(
  diff: LawRevisionDiff,
  isFirstImport: boolean,
): DiffSummary {
  if (isFirstImport) {
    return {
      counts: diff.counts,
      changedArticleNumbers: [],
    };
  }

  const articleNumbers = new Set<string>();
  for (const item of diff.items) {
    if (!CHANGE_KINDS.has(item.kind)) continue;
    const num = extractArticleNumber(item);
    if (num) articleNumbers.add(num);
  }

  return {
    counts: diff.counts,
    changedArticleNumbers: [...articleNumbers],
  };
}
