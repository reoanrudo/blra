/**
 * テスト用アプリ構築ヘルパー。
 *
 * buildApp() にテスト用 DB と Fetcher モックを注入し、
 * app.inject() で HTTP リクエストをシミュレートできるようにする。
 *
 * M5: スタブモード（OIDC無効）時に setStubSession() で
 * テスト用セッションユーザを注入できる。
 */

import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { buildApp } from "../../src/app.js";
import type { FetchResult } from "../../src/ingest/types.js";
import type { SessionUser } from "../../src/auth/types.js";

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

/**
 * テスト用: スタブセッションユーザを設定する。
 * スタブモード（OIDC無効）時のみ有効。
 * OIDC有効時は request.session が優先されるため無視される。
 */
export function setStubSession(
  app: FastifyInstance,
  user: SessionUser | null,
): void {
  const decorated = app as FastifyInstance & {
    stubSessionUser?: SessionUser | null;
  };
  if (decorated.stubSessionUser !== undefined) {
    decorated.stubSessionUser = user;
  }
}

/**
 * テスト用のモック SessionUser を生成する。
 */
export function createMockSessionUser(
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    userId: "00000000-0000-0000-0000-0000000000aa",
    organizationId: "00000000-0000-0000-0000-000000000002",
    roles: ["CORPUS_EDITOR"],
    oidcSub: "test-sub-123",
    oidcIssuer: "http://localhost:8080/realms/blra",
    displayName: "テストユーザ",
    createdAt: Date.now(),
    ...overrides,
  };
}

