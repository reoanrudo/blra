import type { MigrationBuilder } from "node-pg-migrate";

// SCR-03 法令リーダー（法令リーダー）のための参照エッジテーブル。
// 設計書 §7（Reference Edge）、§19.5（サポートペイン「関連」の型ラベル）、§19.10.4（参照3状態）。
//
// edge_type_enum は 0001 で既存（CITES/DELEGATES_TO/APPLIES_MUTATIS_MUTANDIS/DEFINES/EXCEPTS）。
// 本マイグレーションでは:
//   1. resolution_status_enum（参照の解決状態）を新規作成
//   2. reference_edge テーブルを作成
//
// Reference 抽出ロジックの本格実装は S2 本命のため、ここではスキーマのみ用意する。
// M6 / SCR-03 実装時に、DESIGN.md のサンプル条文に対して最小 seed を投入する。

export async function up(pgm: MigrationBuilder): Promise<void> {
  // §19.10.4 参照の3状態 + §19.5 サポートペインの分類
  pgm.createType("resolution_status_enum", [
    "RESOLVED", // 解決済み（target_provision_id が存在）
    "UNCONFIRMED", // 未確認の参照候補（機械抽出・人手未確認）
    "UNRESOLVED", // 未解決（target が本サービスに未収録）
  ]);

  pgm.createTable("reference_edge", {
    edge_id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("uuid_generate_v4()"),
    },
    // 参照元の条文（エッジの始点）
    source_provision_id: {
      type: "uuid",
      notNull: true,
      references: "provision(provision_id)",
      onDelete: "CASCADE",
    },
    // 参照先の条文（解決済みの場合のみ。未収録なら NULL）
    target_provision_id: {
      type: "uuid",
      references: "provision(provision_id)",
      onDelete: "SET NULL",
    },
    // 参照先の表示ラベル（未収録時の「消防法第17条」等。解決済みでも表示名として保持）
    target_label: { type: "text", notNull: true },
    // §7.2 edge_type（既存 enum）
    edge_type: { type: "edge_type_enum", notNull: true },
    // 参照の解決状態
    resolution_status: {
      type: "resolution_status_enum",
      notNull: true,
      default: "UNRESOLVED",
    },
    // 参照元本文中の該当範囲（原文座標 §6.2）。{ start: int, end: int }
    source_text_span: { type: "jsonb" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // 参照取得は常に source_provision_id で引く（§19.10.4）
  pgm.createIndex("reference_edge", "source_provision_id", {
    name: "idx_reference_edge_source",
  });

  // サポートペインは edge_type 順で取得（§19.5 規範: 委任先→定義→例外→参照）
  pgm.createIndex("reference_edge", ["source_provision_id", "edge_type"], {
    name: "idx_reference_edge_source_type",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("reference_edge");
  pgm.dropType("resolution_status_enum");
}
