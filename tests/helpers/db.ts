/**
 * テスト用 DB ヘルパー。
 *
 * 実 PostgreSQL（Docker Compose・ポート5433）を使う統合テスト向け。
 * pipeline.test.ts から抽出した共通セットアップ。
 *
 * 前提: docker compose up -d + テスト用DB(blra_test)のマイグレーションが完了済み。
 *       `npm run migrate:test` で実行可能。
 *
 * テストは本番DB（blra）を破壊しないよう、常に blra_test を使う。
 * 取込データ（25,000+ 条項）が TRUNCATE で消える事故を防ぐための強制分離。
 */

import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import type { Database } from "../../src/db/types.js";

/**
 * テスト用 DATABASE_URL を解決する。
 *
 * 優先順位:
 *   1. TEST_DATABASE_URL 環境変数（CI 等で明示指定）
 *   2. DATABASE_URL が既に blra_test を指している場合 → そのまま（CI 等）
 *   3. 上記以外 → DATABASE_URL の末尾DB名を blra_test へ強制差し替え
 *
 * これにより、誤って本番DB（blra）へ TRUNCATE が走ることを防ぐ。
 */
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base =
    process.env.DATABASE_URL ?? "postgres://blra:blra_dev@localhost:5433/blra";
  const url = new URL(base);
  if (url.pathname === "/blra_test") return base;
  url.pathname = "/blra_test";
  return url.toString();
}

const TEST_DATABASE_URL = resolveTestDatabaseUrl();

/**
 * テスト用 DB 接続を作成する。
 * 呼び出し元で afterAll にて db.destroy() すること。
 */
export function createTestDb(): Kysely<Database> {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
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


