import type { MigrationBuilder } from "node-pg-migrate";

// source_version テーブル: 取得した特定時点の版（不変）。
// 設計書 §13.1（行1070-1089）

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("source_version", {
    source_version_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    source_id: { type: "uuid", notNull: true, references: "source(source_id)" },
    content_hash: { type: "text", notNull: true },
    raw_object_key: { type: "text", notNull: true },
    normalized_object_key: { type: "text" },
    parser_version: { type: "text", notNull: true },
    consolidation_state: { type: "consolidation_state_enum", notNull: true },
    verification_status: { type: "verification_status_enum", notNull: true, default: "UNVERIFIED" },
    promulgated_at: { type: "date" },
    valid_from: { type: "date" },
    valid_from_status: { type: "valid_from_status_enum", notNull: true, default: "FIXED" },
    valid_to: { type: "date" },
    retrieved_at: { type: "timestamptz", notNull: true },
    recorded_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    published_at: { type: "timestamptz" },
    processing_status: { type: "text", notNull: true, default: "PENDING" },
  });

  // §4.2: FIXED の場合のみ valid_from 必須
  pgm.addConstraint("source_version", "source_version_valid_from_check", {
    check: "valid_from_status <> 'FIXED' OR valid_from IS NOT NULL",
  });

  pgm.addConstraint("source_version", "source_version_content_hash_unique", {
    unique: ["source_id", "content_hash"],
  });

  pgm.createIndex("source_version", "source_id", { name: "idx_source_version_source" });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("source_version");
}
