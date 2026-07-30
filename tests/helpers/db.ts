/**
 * テスト用 DB ヘルパー。
 *
 * 実 PostgreSQL（Docker Compose・ポート5433）を使う統合テスト向け。
 * pipeline.test.ts から抽出した共通セットアップ。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/types.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://blra:blra_dev@localhost:5433/blra";

/**
 * テスト用 DB 接続を作成する。
 * 呼び出し元で afterAll にて db.destroy() すること。
 */
export function createTestDb(): Kysely<Database> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/**
 * 全テーブルを TRUNCATE する（各テストの前に実行）。
 * RESTART IDENTITY でシーケンスもリセット。
 * CASCADE で外部キー依存をまとめて消す。
 */
export async function truncateAll(db: Kysely<Database>): Promise<void> {
  await sql`
    TRUNCATE
      provision_version,
      provision,
      source_version,
      source,
      audit_record,
      ingestion_job
    RESTART IDENTITY CASCADE
  `.execute(db);
}
