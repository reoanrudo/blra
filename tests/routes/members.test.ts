/**
 * 組織・メンバー管理 API のテスト（M5: SCR-20）。
 *
 * GET /admin/organizations/:id/members
 * POST /admin/organizations/:id/members
 * PATCH /admin/organizations/:id/members/:userId
 * DELETE /admin/organizations/:id/members/:userId
 *
 * スタブモード（OIDC無効）で setStubSession を使ってセッションを注入しテストする。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createTestDb, truncateAll } from "../helpers/db.js";
import {
  buildTestApp,
  setStubSession,
  createMockSessionUser,
} from "../helpers/app.js";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000002";

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
  // identity系 seed は truncateAll 内で再投入される
  app = await buildTestApp({ db });
});

// === テストデータ投入ヘルパー ===

async function seedUser(
  email: string,
  displayName: string,
): Promise<string> {
  const user = await db
    .insertInto("app_user")
    .values({
      user_id: randomUUID(),
      oidc_issuer: "http://localhost:8080/realms/blra",
      oidc_sub: randomUUID(),
      email,
      display_name: displayName,
      status: "ACTIVE",
    })
    .returning("user_id")
    .executeTakeFirstOrThrow();
  return user.user_id;
}

describe("GET /admin/organizations/:id/members", () => {
  it("ORGANIZATION_ADMIN は自組織のメンバー一覧を取得できる", async () => {
    const userId = await seedUser("member@test.example", "メンバー太郎");
    await db
      .insertInto("organization_member")
      .values({
        organization_id: DEFAULT_ORG_ID,
        user_id: userId,
        role: "RESEARCHER",
      })
      .execute();

    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].email).toBe("member@test.example");
  });

  it("未認証の場合は401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("権限不足（RESEARCHER）の場合は403", async () => {
    setStubSession(
      app,
      createMockSessionUser({
        roles: ["RESEARCHER"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("他組織のメンバー一覧にはアクセスできない（403）", async () => {
    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const otherOrgId = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/admin/organizations/${otherOrgId}/members`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /admin/organizations/:id/members", () => {
  it("既存ユーザを email で指定してメンバー追加できる", async () => {
    await seedUser("newmember@test.example", "新規太郎");
    // 操作者自身もDBに存在させる（granted_by FK 制約のため）
    const adminId = await seedUser("admin@test.example", "管理者");
    // 操作者をDEFAULT組織のORGANIZATION_ADMINとして登録
    await db
      .insertInto("organization_member")
      .values({
        organization_id: DEFAULT_ORG_ID,
        user_id: adminId,
        role: "ORGANIZATION_ADMIN",
      })
      .execute();

    setStubSession(
      app,
      createMockSessionUser({
        userId: adminId,
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
      payload: {
        email: "newmember@test.example",
        role: "RESEARCHER",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.email).toBe("newmember@test.example");
    expect(res.json().data.role).toBe("RESEARCHER");
  });

  it("未登録 email の場合は404", async () => {
    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
      payload: {
        email: "nonexistent@test.example",
        role: "RESEARCHER",
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("無効なロールの場合は400", async () => {
    await seedUser("newmember2@test.example", "新規次郎");

    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members`,
      payload: {
        email: "newmember2@test.example",
        role: "INVALID_ROLE",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /admin/organizations/:id/members/:userId", () => {
  it("ロールを変更できる", async () => {
    const userId = await seedUser("patchtarget@test.example", "変更対象");
    // 操作者をDBに存在させる（granted_by FK のため直接 INSERT で追加）
    await db
      .insertInto("organization_member")
      .values({
        organization_id: DEFAULT_ORG_ID,
        user_id: userId,
        role: "RESEARCHER",
      })
      .execute();

    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    // REVIEWER へ変更
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members/${userId}`,
      payload: { oldRole: "RESEARCHER", newRole: "REVIEWER" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.new_role).toBe("REVIEWER");
  });
});

describe("DELETE /admin/organizations/:id/members/:userId", () => {
  it("メンバーを削除できる", async () => {
    const userId = await seedUser("deletetarget@test.example", "削除対象");
    // 直接 INSERT でメンバー追加
    await db
      .insertInto("organization_member")
      .values({
        organization_id: DEFAULT_ORG_ID,
        user_id: userId,
        role: "RESEARCHER",
      })
      .execute();

    setStubSession(
      app,
      createMockSessionUser({
        roles: ["ORGANIZATION_ADMIN"],
        organizationId: DEFAULT_ORG_ID,
      }),
    );

    // 削除
    const res = await app.inject({
      method: "DELETE",
      url: `/admin/organizations/${DEFAULT_ORG_ID}/members/${userId}?role=RESEARCHER`,
    });

    expect(res.statusCode).toBe(204);
  });
});
