import type { MigrationBuilder } from "node-pg-migrate";

// provision テーブル: 条項号の同一性。
// 設計書 §13.1（行1091-1098）
// canonical_path の生成規則は §6.1（art52-2/para1/item3, suppl:{id}/art1, appdx-table-1）

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("provision", {
    provision_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    source_id: { type: "uuid", notNull: true, references: "source(source_id)" },
    canonical_path: { type: "text", notNull: true },
    provision_type: { type: "provision_type_enum", notNull: true },
    stable_label: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // §6.1: 附則は suppl: 名前空間で一意化。別表はタイトルから生成。
  pgm.addConstraint("provision", "provision_source_path_unique", {
    unique: ["source_id", "canonical_path"],
  });

  pgm.createIndex("provision", "source_id", { name: "idx_provision_source" });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("provision");
}
