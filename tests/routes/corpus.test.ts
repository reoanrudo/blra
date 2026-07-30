/**
 * Corpus API（Source Registry 参照系）のテスト。
 *
 * GET /sources, GET /sources/:id, GET /sources/:id/versions, GET /provisions/:id
 * §5.3 制約: 公開済み版（published_at IS NOT NULL）のみ返すことを検証する。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createTestDb, truncateAll } from "../helpers/db.js";
import { buildTestApp } from "../helpers/app.js";
import type { FastifyInstance } from "fastify";

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

// === テストデータ投入ヘルパー ===

interface SeedData {
  sourceId: string;
  sourceVersionId: string;
  provisionId: string;
}

/**
 * テスト用の source + source_version + provision + provision_version を投入する。
 */
async function seedPublishedSource(
  overrides: {
    title?: string;
    publishedAt?: Date | null;
    sourceStatus?: string;
  } = {},
): Promise<SeedData> {
  const sourceId = randomUUID();
  const sourceVersionId = randomUUID();
  const provisionId = randomUUID();
  const provisionVersionId = randomUUID();

  await db
    .insertInto("source")
    .values({
      source_id: sourceId,
      canonical_uri: `jp/law/test-${sourceId}`,
      title: overrides.title ?? "テスト法令",
      publisher: "日本国",
      authority_class: "PRIMARY_LAW",
      jurisdiction: "jp",
      source_type: "EGOV_LAW",
      status: overrides.sourceStatus ?? "ACTIVE",
    })
    .execute();

  await db
    .insertInto("source_version")
    .values({
      source_version_id: sourceVersionId,
      source_id: sourceId,
      content_hash: `hash-${sourceId.slice(0, 8)}`,
      raw_object_key: `data/raw/${sourceId}/hash.xml`,
      parser_version: "1.0.0",
      consolidation_state: "OFFICIAL_CONSOLIDATED",
      verification_status: "MECHANICAL",
      retrieved_at: new Date(),
      processing_status: "PUBLISHED",
      published_at: overrides.publishedAt === undefined ? new Date() : overrides.publishedAt,
      valid_from: new Date("2025-04-01"),
      valid_from_status: "FIXED",
    })
    .execute();

  await db
    .insertInto("provision")
    .values({
      provision_id: provisionId,
      source_id: sourceId,
      canonical_path: "Article/1",
      provision_type: "ARTICLE",
      stable_label: "第一条",
    })
    .execute();

  await db
    .insertInto("provision_version")
    .values({
      provision_version_id: provisionVersionId,
      provision_id: provisionId,
      source_version_id: sourceVersionId,
      citation_anchor: `jp/law/test-${sourceId.slice(0, 8)}#Art1`,
      heading: "（目的）",
      body: "この法律は、建築物の敷地……",
      body_normalized: "この法律は、建築物の敷地……",
      content_fingerprint: "fp001",
      sequence: 1,
      valid_from: new Date("2025-04-01"),
      valid_from_status: "FIXED",
    })
    .execute();

  return { sourceId, sourceVersionId, provisionId };
}

describe("GET /sources", () => {
  it("公開済み法令の一覧を返す", async () => {
    await seedPublishedSource({ title: "建築基準法" });
    await seedPublishedSource({ title: "都市計画法" });

    const res = await app.inject({ method: "GET", url: "/sources" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toHaveProperty("reference_date");
    expect(body.meta).toHaveProperty("request_id");
  });

  it("データがない場合は空配列を返す", async () => {
    const res = await app.inject({ method: "GET", url: "/sources" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("未公開版（published_at IS NULL）の法令は含まれない", async () => {
    // 公開済み
    await seedPublishedSource({ title: "公開法令", publishedAt: new Date() });
    // 未公開
    await seedPublishedSource({ title: "未公開法令", publishedAt: null });

    const res = await app.inject({ method: "GET", url: "/sources" });

    expect(res.statusCode).toBe(200);
    const titles = res.json().data.map((s: { title: string }) => s.title);
    expect(titles).toContain("公開法令");
    expect(titles).not.toContain("未公開法令");
  });
});

describe("GET /sources/:id", () => {
  it("指定IDの法令メタデータを返す", async () => {
    const { sourceId } = await seedPublishedSource({ title: "建築基準法" });

    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.title).toBe("建築基準法");
    expect(body.data.source_id).toBe(sourceId);
  });

  it("存在しないID場合は404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sources/nonexistent-id",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("GET /sources/:id/versions", () => {
  it("指定法令の公開済み版履歴を返す", async () => {
    const { sourceId } = await seedPublishedSource();

    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}/versions`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toHaveProperty("source_version_id");
    expect(body.data[0]).toHaveProperty("content_hash");
    expect(body.data[0]).toHaveProperty("published_at");
  });

  it("存在しない法令ID場合は404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sources/nonexistent/versions",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /provisions/:id", () => {
  it("指定条項の現行版を返す", async () => {
    const { provisionId } = await seedPublishedSource();

    const res = await app.inject({
      method: "GET",
      url: `/provisions/${provisionId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.provision_id).toBe(provisionId);
    expect(body.data.canonical_path).toBe("Article/1");
    expect(body.data.version.heading).toBe("（目的）");
    expect(body.data.version.body).toContain("建築物");
  });

  it("存在しない条項ID場合は404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/provisions/nonexistent-id",
    });

    expect(res.statusCode).toBe(404);
  });
});

// === SCR-03 法令リーダー向けエンドポイント ===

describe("GET /sources/:id/provisions", () => {
  it("指定法令の条文一覧（現行版付き）を sequence 順で返す", async () => {
    const { sourceId } = await seedPublishedSource();

    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}/provisions`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].canonical_path).toBe("Article/1");
    expect(body.data[0].stable_label).toBe("第一条");
    expect(body.data[0].version.body).toContain("建築物");
    expect(body.meta).toHaveProperty("corpus_version");
  });

  it("複数条文が sequence 昇順で返る", async () => {
    const sourceId = randomUUID();
    const sourceVersionId = randomUUID();

    await db
      .insertInto("source")
      .values({
        source_id: sourceId,
        canonical_uri: `jp/law/test-${sourceId.slice(0, 8)}`,
        title: "複数条文テスト",
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
        content_hash: `hash-${sourceId.slice(0, 8)}`,
        raw_object_key: `data/raw/${sourceId}/hash.xml`,
        parser_version: "1.0.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        verification_status: "MECHANICAL",
        retrieved_at: new Date(),
        processing_status: "PUBLISHED",
        published_at: new Date(),
        valid_from: new Date("2025-04-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    // sequence 順に並ばないように意図的に逆順で投入
    for (const seq of [3, 1, 2]) {
      const pid = randomUUID();
      await db.insertInto("provision").values({
        provision_id: pid,
        source_id: sourceId,
        canonical_path: `Article/${seq}`,
        provision_type: "ARTICLE",
        stable_label: `第${seq}条`,
      }).execute();

      await db.insertInto("provision_version").values({
        provision_version_id: randomUUID(),
        provision_id: pid,
        source_version_id: sourceVersionId,
        citation_anchor: `jp/law/test#Art${seq}`,
        heading: null,
        body: `第${seq}条の本文`,
        body_normalized: `第${seq}条の本文`,
        content_fingerprint: `fp${seq}`,
        sequence: seq,
        valid_from: new Date("2025-04-01"),
        valid_from_status: "FIXED",
      }).execute();
    }

    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}/provisions`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    // sequence 昇順で返ることを検証
    const seqs = body.data.map(
      (p: { version: { sequence: number } }) => p.version.sequence,
    );
    expect(seqs).toEqual([1, 2, 3]);
  });

  it("from/limit クエリパラメータでページネーション", async () => {
    const sourceId = randomUUID();
    const sourceVersionId = randomUUID();

    await db
      .insertInto("source")
      .values({
        source_id: sourceId,
        canonical_uri: `jp/law/test-${sourceId.slice(0, 8)}`,
        title: "ページネーションテスト",
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
        content_hash: `hash-${sourceId.slice(0, 8)}`,
        raw_object_key: `data/raw/${sourceId}/hash.xml`,
        parser_version: "1.0.0",
        consolidation_state: "OFFICIAL_CONSOLIDATED",
        verification_status: "MECHANICAL",
        retrieved_at: new Date(),
        processing_status: "PUBLISHED",
        published_at: new Date(),
        valid_from: new Date("2025-04-01"),
        valid_from_status: "FIXED",
      })
      .execute();

    for (let seq = 1; seq <= 5; seq++) {
      const pid = randomUUID();
      await db.insertInto("provision").values({
        provision_id: pid,
        source_id: sourceId,
        canonical_path: `Article/${seq}`,
        provision_type: "ARTICLE",
        stable_label: `第${seq}条`,
      }).execute();

      await db.insertInto("provision_version").values({
        provision_version_id: randomUUID(),
        provision_id: pid,
        source_version_id: sourceVersionId,
        citation_anchor: `jp/law/test#Art${seq}`,
        heading: null,
        body: `第${seq}条`,
        body_normalized: `第${seq}条`,
        content_fingerprint: `fp${seq}`,
        sequence: seq,
        valid_from: new Date("2025-04-01"),
        valid_from_status: "FIXED",
      }).execute();
    }

    // from=2, limit=2 で seq 3,4 が返る
    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}/provisions?from=2&limit=2`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    const seqs = body.data.map(
      (p: { version: { sequence: number } }) => p.version.sequence,
    );
    expect(seqs).toEqual([3, 4]);
  });

  it("データがない場合は空配列", async () => {
    const { sourceId } = await seedPublishedSource();

    const res = await app.inject({
      method: "GET",
      url: `/sources/${sourceId}/provisions`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1); // seedPublishedSource が1件作る
  });

  it("存在しない法令ID場合は404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sources/nonexistent-id/provisions",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /provisions/:id/references", () => {
  it("指定条文の参照エッジを §19.5 規範順で返す", async () => {
    const { sourceId, provisionId } = await seedPublishedSource();

    // 別の条文（参照先）を作成
    const targetProvisionId = randomUUID();
    await db.insertInto("provision").values({
      provision_id: targetProvisionId,
      source_id: sourceId,
      canonical_path: "Article/126-2",
      provision_type: "ARTICLE",
      stable_label: "第126条の2",
    }).execute();

    // 参照エッジを投入（投入順は意図的に規範順と逆）
    await db.insertInto("reference_edge").values({
      edge_id: randomUUID(),
      source_provision_id: provisionId,
      target_provision_id: null,
      target_label: "消防法第17条",
      edge_type: "CITES",
      resolution_status: "UNRESOLVED",
      source_text_span: { start: 10, end: 20 },
    }).execute();

    await db.insertInto("reference_edge").values({
      edge_id: randomUUID(),
      source_provision_id: provisionId,
      target_provision_id: targetProvisionId,
      target_label: "令第126条の2",
      edge_type: "DELEGATES_TO",
      resolution_status: "RESOLVED",
      source_text_span: { start: 5, end: 15 },
    }).execute();

    await db.insertInto("reference_edge").values({
      edge_id: randomUUID(),
      source_provision_id: provisionId,
      target_provision_id: null,
      target_label: "別表第一",
      edge_type: "CITES",
      resolution_status: "UNCONFIRMED",
    }).execute();

    const res = await app.inject({
      method: "GET",
      url: `/provisions/${provisionId}/references`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    // §19.5 規範順: RESOLVED(DELEGATES_TO) → UNCONFIRMED → UNRESOLVED
    expect(body.data[0].edge_type).toBe("DELEGATES_TO");
    expect(body.data[0].resolution_status).toBe("RESOLVED");
    expect(body.data[1].resolution_status).toBe("UNCONFIRMED");
    expect(body.data[2].resolution_status).toBe("UNRESOLVED");
    expect(body.data[0].source_text_span).toEqual({ start: 5, end: 15 });
  });

  it("参照エッジがない場合は空配列", async () => {
    const { provisionId } = await seedPublishedSource();

    const res = await app.inject({
      method: "GET",
      url: `/provisions/${provisionId}/references`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("存在しない条文ID場合は404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/provisions/nonexistent-id/references",
    });

    expect(res.statusCode).toBe(404);
  });
});
