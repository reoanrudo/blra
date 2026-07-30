/**
 * reference_edge テーブルのリポジトリ。
 *
 * 設計書 §7（Reference Edge）、§19.5（サポートペイン「関連」の型ラベル）、
 * §19.10.4（本文中の参照3状態）。
 *
 * Reference 抽出ロジックの本格実装は S2 本命。本リポジトリは読み取り系と
 * SCR-03 実装時の最小 seed 投入用ヘルパのみを提供する。
 */

import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { Database, EdgeType, ResolutionStatus } from "../types.js";

type ReferenceEdge = Selectable<Database["reference_edge"]>;

/**
 * §19.5 サポートペイン「関連」の表示順序。
 * 委任先 → 定義 → 例外 → 参照 → 未確認の参照候補 → 未解決参照 の順。
 *
 * edge_type と resolution_status の組み合わせでソートキーを決める:
 *  1. DELEGATES_TO + RESOLVED      （委任先）
 *  2. DEFINES + RESOLVED           （定義）
 *  3. EXCEPTS + RESOLVED           （例外）
 *  4. CITES + RESOLVED             （参照）
 *  5. * + UNCONFIRMED              （未確認の参照候補）
 *  6. * + UNRESOLVED               （未解決参照）
 */
const SORT_ORDER: Record<string, number> = {
  // resolution_status 優先度（小さいほど先頭）
  RESOLVED: 0,
  UNCONFIRMED: 1,
  UNRESOLVED: 2,
};

const EDGE_TYPE_ORDER: Record<EdgeType, number> = {
  DELEGATES_TO: 0, // 委任先
  DEFINES: 1, // 定義
  EXCEPTS: 2, // 例外
  CITES: 3, // 参照
  APPLIES_MUTATIS_MUTANDIS: 4, // 準用
};

/**
 * §19.5 規範の順序でソートする比較関数。
 * 1. resolution_status（RESOLVED < UNCONFIRMED < UNRESOLVED）
 * 2. edge_type（DELEGATES_TO < DEFINES < EXCEPTS < CITES < APPLIES_MUTATIS_MUTANDIS）
 */
function sortByDesignSpec(a: ReferenceEdge, b: ReferenceEdge): number {
  const statusDiff =
    SORT_ORDER[a.resolution_status] - SORT_ORDER[b.resolution_status];
  if (statusDiff !== 0) return statusDiff;
  return EDGE_TYPE_ORDER[a.edge_type] - EDGE_TYPE_ORDER[b.edge_type];
}

/**
 * 指定条文（source_provision_id）からの参照エッジ一覧を取得する。
 * §19.5 規範順（委任先→定義→例外→参照→未確認→未解決）で返す。
 */
export async function listReferenceEdgesBySource(
  db: Kysely<Database>,
  sourceProvisionId: string,
): Promise<ReferenceEdge[]> {
  const rows = await db
    .selectFrom("reference_edge")
    .selectAll()
    .where("source_provision_id", "=", sourceProvisionId)
    .execute();

  return rows.sort(sortByDesignSpec);
}

/**
 * 参照エッジを1件作成する（SCR-03 実装時の seed 投入用）。
 * 本格的な Reference 抽出は S2 本命のため、通常の取込パイプラインからは呼ばれない。
 */
export async function insertReferenceEdge(
  db: Kysely<Database>,
  params: {
    sourceProvisionId: string;
    targetProvisionId?: string | null;
    targetLabel: string;
    edgeType: EdgeType;
    resolutionStatus: ResolutionStatus;
    sourceTextSpan?: { start: number; end: number } | null;
  },
): Promise<string> {
  const result = await db
    .insertInto("reference_edge")
    .values({
      edge_id: randomUUID(),
      source_provision_id: params.sourceProvisionId,
      target_provision_id: params.targetProvisionId ?? null,
      target_label: params.targetLabel,
      edge_type: params.edgeType,
      resolution_status: params.resolutionStatus,
      source_text_span: params.sourceTextSpan ?? null,
    })
    .returning("edge_id")
    .executeTakeFirstOrThrow();

  return result.edge_id;
}
