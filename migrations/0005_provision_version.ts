import type { MigrationBuilder } from "node-pg-migrate";

// provision_version テーブル: 特定時点の本文（不変）。
// 設計書 §13.1（行1100-1125）
// ★ EXCLUDE制約: ADR-013 同一Provisionの有効期間重複をDB層で禁止（btree_gist 必須）

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("provision_version", {
    provision_version_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    provision_id: { type: "uuid", notNull: true, references: "provision(provision_id)" },
    source_version_id: { type: "uuid", notNull: true, references: "source_version(source_version_id)" },
    citation_anchor: { type: "text", notNull: true },
    heading: { type: "text" },
    body: { type: "text", notNull: true },
    body_normalized: { type: "text", notNull: true },
    content_fingerprint: { type: "text", notNull: true },
    text_quote_prefix: { type: "text" },
    text_quote_suffix: { type: "text" },
    sequence: { type: "integer", notNull: true },
    valid_from: { type: "date" },
    valid_from_status: { type: "valid_from_status_enum", notNull: true, default: "FIXED" },
    valid_to: { type: "date" },
  });

  // §4.2: FIXED の場合のみ valid_from 必須
  pgm.addConstraint("provision_version", "provision_version_valid_from_check", {
    check: "valid_from_status <> 'FIXED' OR valid_from IS NOT NULL",
  });

  pgm.addConstraint("provision_version", "provision_version_anchor_valid_from_unique", {
    unique: ["citation_anchor", "valid_from"],
  });

  // ★ ADR-013: 同一 Provision の有効期間重複を DB 層で禁止
  // btree_gist 拡張が uuid の等値比較（provision_id WITH =）を可能にする。
  // FIXED の版のみ制約を適用（UNDETERMINED/ESTIMATED は除外）。
  pgm.sql(`
    ALTER TABLE provision_version
    ADD CONSTRAINT no_overlapping_validity
    EXCLUDE USING gist (
      provision_id WITH =,
      daterange(valid_from, valid_to, '[)') WITH &&
    ) WHERE (valid_from_status = 'FIXED')
  `);

  pgm.createIndex("provision_version", "provision_id", { name: "idx_provision_version_provision" });
  pgm.createIndex("provision_version", "source_version_id", { name: "idx_provision_version_source_version" });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("provision_version");
}
