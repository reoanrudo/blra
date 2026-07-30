/**
 * テスト用アプリ構築ヘルパー。
 *
 * buildApp() にテスト用 DB と Fetcher モックを注入し、
 * app.inject() で HTTP リクエストをシミュレートできるようにする。
 */

import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { buildApp } from "../../src/app.js";
import type { FetchResult } from "../../src/ingest/types.js";

export interface TestAppOptions {
  db: Kysely<Database>;
  /** 取込 Fetcher モック。省略時は本番 Fetcher を使う（ネットワーク必要）。 */
  ingestFetcher?: (lawId: string) => Promise<FetchResult>;
}

/**
 * テスト用 Fastify アプリを構築する。
 * ログを "silent" にしてテスト出力を抑える。
 */
export async function buildTestApp(
  options: TestAppOptions,
): Promise<FastifyInstance> {
  return buildApp({
    db: options.db,
    logLevel: "silent",
    admin: options.ingestFetcher
      ? { ingestFetcher: options.ingestFetcher }
      : undefined,
  });
}
