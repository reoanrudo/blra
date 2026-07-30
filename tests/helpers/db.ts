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
 * M5: identity 系テーブル（organization_member, app_user, organization）を追加。
 *     organization は RLS 有効のため、seed 投入時は row_security を一時バイパスする。
 */
export async function truncateAll(db: Kysely<Database>): Promise<void> {
  await db.connection().execute(async (conn) => {
    await sql`SET row_security = off`.execute(conn);
    await sql`
      TRUNCATE
        reference_edge,
        provision_version,
        provision,
        source_version,
        source,
        audit_record,
        ingestion_job,
        organization_member,
        app_user,
        organization
      RESTART IDENTITY CASCADE
    `.execute(conn);

    // identity 系 seed の再投入
    await sql`
      INSERT INTO organization (organization_id, name, status) VALUES
        ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000002', 'DEFAULT', 'ACTIVE')
    `.execute(conn);

    await sql`SET row_security = on`.execute(conn);
  });
}


