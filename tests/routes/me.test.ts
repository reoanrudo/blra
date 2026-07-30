/**
 * /me エンドポイントのテスト（M5）。
 *
 * 設計書 §19.18.3「auth → OIDC / me」。
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

describe("GET /me", () => {
  it("未認証の場合は401を返す", async () => {
    // セッション未注入
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("認証済みの場合はユーザ情報を返す", async () => {
    setStubSession(app, createMockSessionUser());

    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.roles).toContain("CORPUS_EDITOR");
    expect(body.data.display_name).toBe("テストユーザ");
    expect(body.meta.request_id).toBeDefined();
  });

  it("応答に meta が含まれる（§12.2）", async () => {
    setStubSession(app, createMockSessionUser());

    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    const meta = res.json().meta;
    expect(meta.reference_date).toBeDefined();
    expect(meta.request_id).toBeDefined();
  });
});
