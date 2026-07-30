import type { MigrationBuilder } from "node-pg-migrate";

// source テーブル: 法令文書の同一性。
// 設計書 §13.1（行1056-1068）+ §4.6（coverage_from、ADR-019 で第一級概念）

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("source", {
    source_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    canonical_uri: { type: "text", notNull: true },
    title: { type: "text", notNull: true },
    title_kana: { type: "text" },
    abbrev: { type: "text[]", },
    publisher: { type: "text", notNull: true },
    authority_class: { type: "authority_class_enum", notNull: true },
    jurisdiction: { type: "text", notNull: true },
    source_type: { type: "source_type_enum", notNull: true },
    // §4.6 + ADR-019: coverage_from は第一級概念（設計書DDLからの補完）
    coverage_from: { type: "date" },
    status: { type: "text", notNull: true, default: "ACTIVE" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.addConstraint("source", "source_canonical_uri_unique", {
    unique: ["canonical_uri"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("source");
}
