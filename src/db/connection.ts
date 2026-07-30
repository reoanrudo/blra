/**
 * データベース接続。
 * pg Pool を Kysely の Dialect として使用する。
 * アプリケーション全体で単一の Kysely インスタンスを共有する。
 */

import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import type { Database } from "./types.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

/**
 * アプリケーション終了時に呼び出して接続を閉じる。
 */
export async function closeDatabase(): Promise<void> {
  await db.destroy();
}

export { pool };
