import type { MigrationBuilder } from "node-pg-migrate";

// 運用側テーブル: audit_record（§12.4、追記専用）と ingestion_job（§3.2、§8.2）。
// S1 で必要な運用テーブルの最小構成。

export async function up(pgm: MigrationBuilder): Promise<void> {
  // §12.4 監査ログ（追記専用）
  pgm.createTable("audit_record", {
    audit_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    occurred_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    actor_id: { type: "uuid" },
    organization_id: { type: "uuid" },
    action: { type: "text", notNull: true },
    resource_type: { type: "text", notNull: true },
    resource_id: { type: "text" },
    before_hash: { type: "text" },
    after_hash: { type: "text" },
    correlation_id: { type: "uuid" },
    client_context: { type: "jsonb" },
  });

  pgm.createIndex("audit_record", "occurred_at", { name: "idx_audit_record_occurred_at" });
  pgm.createIndex("audit_record", "resource_type", { name: "idx_audit_record_resource_type" });

  // §8.2 取込ジョブ（At-Least-Once + Idempotency Key）
  pgm.createTable("ingestion_job", {
    job_id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    source_id: { type: "uuid", notNull: true, references: "source(source_id)" },
    job_type: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "PENDING" },
    idempotency_key: { type: "text", notNull: true },
    parser_version: { type: "text" },
    started_at: { type: "timestamptz" },
    completed_at: { type: "timestamptz" },
    error_detail: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // §8.2 原則5: Idempotency Key（同一 source + key で重複実行を防ぐ）
  pgm.addConstraint("ingestion_job", "ingestion_job_idempotency_unique", {
    unique: ["source_id", "idempotency_key"],
  });

  pgm.createIndex("ingestion_job", "status", { name: "idx_ingestion_job_status" });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("ingestion_job");
  pgm.dropTable("audit_record");
}
