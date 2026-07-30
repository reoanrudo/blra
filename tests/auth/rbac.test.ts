/**
 * RBAC（ロールベースアクセス制御）のテスト（M5）。
 *
 * 設計書 §12.3（ロール5種）、§5.3（公開API）、§5.4（Publish権限）。
 * 各エンドポイントに対するロール別アクセス可否を検証する。
 *
 * スタブモード（OIDC無効）で setStubSession を使ってセッションを注入しテストする。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createTestDb, truncateAll } from "../helpers/db.js";
import {
  buildTestApp,
  setStubSession,
  createMockSessionUser,
} from "../helpers/app.js";

let db: Kysely<Database>;
let app: FastifyInstance;

beforeAll(async () => {
  db = createTestDb();
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

beforeEach(async () => {
  await truncateAll(db);
  app = await buildTestApp({ db });
});

describe("RBAC: 未認証アクセス", () => {
  it("Admin系エンドポイントは未認証で401", async () => {
    const endpoints = [
      { method: "GET", url: "/admin/audit" },
      { method: "POST", url: "/admin/ingest" },
      { method: "GET", url: "/me" },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({ method: ep.method, url: ep.url });
      expect(res.statusCode).toBe(401);
    }
  });

  it("参照系（Corpus API）は未認証でもアクセス可能（§5.3）", async () => {
    // /sources は認証不要
    const res = await app.inject({ method: "GET", url: "/sources" });
    // データがなくても 200 が返る（空配害）
    expect(res.statusCode).toBe(200);
  });
});

describe("RBAC: ロール別エンドポイントアクセス", () => {
  it("CORPUS_EDITOR は ingest 可能、audit は不可", async () => {
    setStubSession(app, createMockSessionUser({ roles: ["CORPUS_EDITOR"] }));

    // ingest は CORPUS_EDITOR が呼べる（本体は Fetcher が必要なので認可のみ確認）
    const ingestRes = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "test" },
    });
    // 401/403 でなければ認可は通過（パイプラインエラーは500等）
    expect(ingestRes.statusCode).not.toBe(401);
    expect(ingestRes.statusCode).not.toBe(403);

    // audit は SYSTEM_ADMIN のみ
    const auditRes = await app.inject({
      method: "GET",
      url: "/admin/audit",
    });
    expect(auditRes.statusCode).toBe(403);
  });

  it("SYSTEM_ADMIN は audit 可能、ingest は不可", async () => {
    setStubSession(app, createMockSessionUser({ roles: ["SYSTEM_ADMIN"] }));

    // audit は SYSTEM_ADMIN が呼べる
    const auditRes = await app.inject({
      method: "GET",
      url: "/admin/audit",
    });
    expect(auditRes.statusCode).toBe(200);

    // ingest は CORPUS_EDITOR のみ（SYSTEM_ADMIN は法令内容の承認権限を持たない: §12.3）
    const ingestRes = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "test" },
    });
    expect(ingestRes.statusCode).toBe(403);
  });

  it("RESEARCHER は ingest も audit も不可", async () => {
    setStubSession(app, createMockSessionUser({ roles: ["RESEARCHER"] }));

    const ingestRes = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "test" },
    });
    expect(ingestRes.statusCode).toBe(403);

    const auditRes = await app.inject({
      method: "GET",
      url: "/admin/audit",
    });
    expect(auditRes.statusCode).toBe(403);
  });

  it("複数ロール所持時はいずれかが合致すればアクセス可能", async () => {
    setStubSession(
      app,
      createMockSessionUser({ roles: ["RESEARCHER", "CORPUS_EDITOR"] }),
    );

    // CORPUS_EDITOR を持っているので ingest 可能
    const ingestRes = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "test" },
    });
    expect(ingestRes.statusCode).not.toBe(401);
    expect(ingestRes.statusCode).not.toBe(403);
  });
});

describe("RBAC: 403 エラーメッセージ", () => {
  it("権限不足時のメッセージに必要ロールが含まれる", async () => {
    setStubSession(app, createMockSessionUser({ roles: ["RESEARCHER"] }));

    const res = await app.inject({
      method: "GET",
      url: "/admin/audit",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    // メッセージに必要ロール名が含まれる
    expect(res.json().error.message).toContain("SYSTEM_ADMIN");
  });
});
