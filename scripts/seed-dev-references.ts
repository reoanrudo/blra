/**
 * 開発用 reference_edge シード（SCR-03 法令リーダー Phase 2 検証用）。
 *
 * ingest で取り込んだ建築基準法の条文に対し、DESIGN.md §5 記載の参照関係
 * （委任先 / 定義 / 例外 / 参照 + 未確認 / 未解決）を reference_edge テーブルへ投入する。
 *
 * 設計書 §7（Reference Edge）、§19.5（サポートペイン「関連」）、§19.10.4（参照3状態）に基づく。
 * migration 0008 のコメントにもある通り、参照抽出ロジックの本格実装は S2 本命のため、
 * ここでは開発検証用の最小 seed のみを用意する。
 *
 * 実行: npm run seed:dev
 *
 * 注意: このスクリプトは冪等ではない。実行ごとに reference_edge をクリアしてから投入する。
 * provision_id は ingest の度に変わるため、canonical_path から動的に解決する。
 */
import "dotenv/config";
import { db } from "../src/db/connection.js";
import type { Database } from "../src/db/types.js";

interface SeedEdge {
  /** 参照元の canonical_path */
  source_path: string;
  /** 参照先の canonical_path（未解決の場合は null） */
  target_path: string | null;
  /** 表示ラベル（未解決時や、target とは別の表示名を使う場合） */
  target_label: string;
  edge_type: "CITES" | "DELEGATES_TO" | "DEFINES" | "EXCEPTS";
  resolution_status: "RESOLVED" | "UNCONFIRMED" | "UNRESOLVED";
  /** 本文中の参照語句の開始・終了位置（0始まり・end は排他）。§6.2 原文座標 */
  source_text_span: { start: number; end: number } | null;
}

/**
 * 第35条第1項の参照関係（DESIGN.md §5 記載をベースに、実際の ingest 本文へ合わせる）。
 *
 * 実際の本文:
 *   「栓槽別表第一（い）欄（一）項から（四）項までに掲げる用途に供する特殊建築物、
 *    階数が三以上である建築物、政令で定める窓その他の開口部を有しない居室を有する建築物
 *    又は延べ面積（...）が千平方メートルをこえる建築物については、廊下、階段、出入口その他の
 *    避難施設、消火、スプリンクラー、貯水その他の消火設備、排煙設備、非常用の照明装置及び進入口
 *    並びに敷地内の避難上及び消火上必要な通路は、政令で定める技術的基準に従つて、避難上及び消火上
 *    支障がないようにしなければならない。」
 *
 * source_text_span は本文先頭（"栓槽"の直前=0）からの文字オフセット。
 * ※ "栓槽" は e-Gov 原文の先頭ノイズ（parser の既知の挙動）。参照範囲は実本文に合わせる。
 */
const SEED_EDGES: SeedEdge[] = [
  {
    source_path: "art35/para1",
    target_path: "appdx-table-1",
    target_label: "別表第一（い）欄",
    edge_type: "CITES",
    resolution_status: "RESOLVED",
    // "別表第一（い）欄" の位置（"栓槽"=2文字の直後）
    source_text_span: { start: 2, end: 11 },
  },
  {
    source_path: "art35/para1",
    target_path: null,
    target_label: "令第126条の2 排煙設備の設置",
    edge_type: "DELEGATES_TO",
    resolution_status: "UNCONFIRMED",
    // "政令で定める技術的基準" の位置（本文末尾付近）
    source_text_span: { start: 196, end: 207 },
  },
  {
    source_path: "art35/para1",
    target_path: "art2/para1/item9-2",
    target_label: "法第2条第1項第九号の二 耐火建築物",
    edge_type: "DEFINES",
    resolution_status: "RESOLVED",
    // "政令で定める窓その他の開口部を有しない居室" の位置
    source_text_span: { start: 58, end: 85 },
  },
  {
    source_path: "art35/para1",
    target_path: null,
    target_label: "令第126条の2第1項第一号 適用しない部分",
    edge_type: "EXCEPTS",
    resolution_status: "UNCONFIRMED",
    source_text_span: null,
  },
  {
    source_path: "art35/para1",
    target_path: null,
    target_label: "消防法第17条",
    edge_type: "CITES",
    resolution_status: "UNRESOLVED",
    source_text_span: null,
  },
];

async function resolveProvisionId(
  canonicalPath: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("provision")
    .select("provision_id")
    .where("canonical_path", "=", canonicalPath)
    .executeTakeFirst();
  return row?.provision_id ?? null;
}

async function seedReferences(): Promise<void> {
  console.log("=== 開発用 reference_edge シード ===\n");

  // 既存データをクリア（冪等性のため）
  await db.deleteFrom("reference_edge").execute();
  console.log("既存 reference_edge をクリアしました。\n");

  let inserted = 0;
  let skipped = 0;

  for (const edge of SEED_EDGES) {
    const sourceId = await resolveProvisionId(edge.source_path);
    if (!sourceId) {
      console.warn(
        `  スキップ: 参照元 ${edge.source_path} が見つかりません`,
      );
      skipped++;
      continue;
    }

    // target_path が指定されていれば解決、未解決なら null
    let targetId: string | null = null;
    if (edge.target_path) {
      targetId = await resolveProvisionId(edge.target_path);
      if (!targetId) {
        console.warn(
          `  スキップ: 参照先 ${edge.target_path} が見つかりません`,
        );
        skipped++;
        continue;
      }
    }

    await db
      .insertInto("reference_edge")
      .values({
        source_provision_id: sourceId,
        target_provision_id: targetId,
        target_label: edge.target_label,
        edge_type: edge.edge_type,
        resolution_status: edge.resolution_status,
        source_text_span: edge.source_text_span,
      })
      .execute();

    const statusIcon =
      edge.resolution_status === "RESOLVED"
        ? "✓"
        : edge.resolution_status === "UNCONFIRMED"
          ? "?"
          : "✗";
    console.log(
      `  ${statusIcon} ${edge.source_path} → ${edge.target_label} [${edge.edge_type}/${edge.resolution_status}]`,
    );
    inserted++;
  }

  console.log(
    `\nシード完了: ${inserted}件投入、${skipped}件スキップ（参照元・先がDBに存在しない）`,
  );
}

async function main(): Promise<void> {
  try {
    await seedReferences();
  } catch (err) {
    console.error("シードエラー:", err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main();
