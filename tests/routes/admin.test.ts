/**
 * Admin API のテスト。
 *
 * POST /admin/source-versions/:id/publish — 手動Publish + 監査記録
 * GET  /admin/audit — 監査ログ検索
 * POST /admin/ingest — 取込トリガー（Fetcher モック使用）
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import type { FetchResult } from "../../src/ingest/types.js";
import { createTestDb, truncateAll } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";
import { insertAuditRecord } from "../../src/db/repos/audit-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(
  join(__dirname, "../fixtures/minimal-law.xml"),
  "utf-8",
);

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
});

// === テストデータ投入ヘルパー ===

async function seedUnpublishedVersion(): Promise<{
  sourceId: string;
  sourceVersionId: string;
}> {
  const sourceId = randomUUID();
  const sourceVersionId = randomUUID();

  await db
    .insertInto("source")
    .values({
      source_id: sourceId,
      canonical_uri: `jp/law/test-${sourceId}`,
      title: "テスト法令",
      publisher: "日本国",
      authority_class: "PRIMARY_LAW",
      jurisdiction: "jp",
      source_type: "EGOV_LAW",
      status: "ACTIVE",
    })
    .execute();

  await db
    .insertInto("source_version")
    .values({
      source_version_id: sourceVersionId,
      source_id: sourceId,
      content_hash: `unpub-${sourceId.slice(0, 8)}`,
      raw_object_key: `data/raw/${sourceId}/unpub.xml`,
      parser_version: "1.0.0",
      consolidation_state: "OFFICIAL_CONSOLIDATED",
      verification_status: "MECHANICAL",
      retrieved_at: new Date(),
      processing_status: "PENDING_REVIEW",
      published_at: null,
      valid_from: new Date("2025-04-01"),
      valid_from_status: "FIXED",
    })
    .execute();

  return { sourceId, sourceVersionId };
}

// Fetcher モック（minimal-law.xml を返す）
function mockFetcher(): (lawId: string) => Promise<FetchResult> {
  return async (_lawId: string): Promise<FetchResult> => ({
    lawInfo: {
      law_type: "Constitution",
      law_id: "325AC0000000201",
      law_num: "昭和二十五年法律第二百一号",
      promulgation_date: "1950-05-24",
    },
    revisionInfo: {
      law_revision_id: "325AC0000000201_test",
      law_title: "建築基準法",
      amendment_enforcement_date: "2025-04-01",
      amendment_promulgate_date: "2024-12-11",
    },
    xml: FIXTURE_XML,
  });
}

// ========================================
// POST /admin/source-versions/:id/publish
// ========================================

describe("POST /admin/source-versions/:id/publish", () => {
  beforeEach(async () => {
    app = await buildTestApp({ db });
  });

  it("未公開バージョンをPublishし published_at をセットする", async () => {
    const { sourceVersionId } = await seedUnpublishedVersion();

    const res = await app.inject({
      method: "POST",
      url: `/admin/source-versions/${sourceVersionId}/publish`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.source_version_id).toBe(sourceVersionId);
    expect(body.data.published_at).toBeTruthy();
    expect(body.data.processing_status).toBe("PUBLISHED");
  });

  it("Publish時に監査レコードが記録される", async () => {
    const { sourceVersionId } = await seedUnpublishedVersion();

    await app.inject({
      method: "POST",
      url: `/admin/source-versions/${sourceVersionId}/publish`,
    });

    // 監査レコードを確認
    const auditRecords = await db
      .selectFrom("audit_record")
      .selectAll()
      .where("action", "=", "PUBLISH")
      .where("resource_id", "=", sourceVersionId)
      .execute();

    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0]!.resource_type).toBe("source_version");
  });

  it("存在しないID場合は404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/source-versions/nonexistent/publish",
    });

    expect(res.statusCode).toBe(404);
  });

  it("既にPublish済みの版は409（冪等でない）", async () => {
    const { sourceVersionId } = await seedUnpublishedVersion();

    // 1回目: 成功
    const res1 = await app.inject({
      method: "POST",
      url: `/admin/source-versions/${sourceVersionId}/publish`,
    });
    expect(res1.statusCode).toBe(200);

    // 2回目: 既にPublish済みなので409
    const res2 = await app.inject({
      method: "POST",
      url: `/admin/source-versions/${sourceVersionId}/publish`,
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error.code).toBe("ALREADY_PUBLISHED");
  });
});

// ========================================
// GET /admin/audit
// ========================================

describe("GET /admin/audit", () => {
  beforeEach(async () => {
    // 監査レコードを直接投入
    await insertAuditRecord(db, {
      action: "PUBLISH",
      resourceType: "source_version",
      resourceId: "sv-001",
    });
    await insertAuditRecord(db, {
      action: "INGEST",
      resourceType: "source_version",
      resourceId: "sv-002",
    });
    app = await buildTestApp({ db });
  });

  it("全件取得する", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/audit" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.meta).toHaveProperty("request_id");
  });

  it("action クエリで絞り込む", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/audit?action=PUBLISH",
    });

    expect(res.statusCode).toBe(200);
    const records = res.json().data;
    expect(records).toHaveLength(1);
    expect(records[0].action).toBe("PUBLISH");
  });

  it("resourceType クエリで絞り込む", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/audit?resourceType=source_version",
    });

    expect(res.statusCode).toBe(200);
    const records = res.json().data;
    expect(records.length).toBeGreaterThanOrEqual(2);
  });

  it("limit クエリで取得件数を制限する", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/audit?limit=1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

// ========================================
// POST /admin/ingest
// ========================================

describe("POST /admin/ingest", () => {
  beforeEach(async () => {
    app = await buildTestApp({ db, ingestFetcher: mockFetcher() });
  });

  it("lawId を受け取って取込を実行し結果を返す", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "325AC0000000201" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe("INGESTED");
    expect(body.data.source_id).toBeTruthy();
    expect(body.data.source_version_id).toBeTruthy();
    expect(body.data.segment_count).toBeGreaterThan(0);
  });

  it("取込時に監査レコードが記録される", async () => {
    await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "325AC0000000201" },
    });

    const auditRecords = await db
      .selectFrom("audit_record")
      .selectAll()
      .where("action", "=", "INGEST")
      .execute();

    expect(auditRecords.length).toBeGreaterThanOrEqual(1);
    expect(auditRecords[0]!.resource_type).toBe("source_version");
  });

  it("2回目の取込はSKIPになる（冪等性）", async () => {
    // 1回目
    const res1 = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "325AC0000000201" },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().data.status).toBe("INGESTED");

    // 2回目: 同じ content_hash なので SKIP
    const res2 = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: { lawId: "325AC0000000201" },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data.status).toBe("SKIPPED");
  });

  it("lawId が空の場合はバリデーションエラー", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/ingest",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
