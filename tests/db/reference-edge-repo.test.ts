/**
 * reference-edge-repo のテスト。
 *
 * §19.5 サポートペイン「関連」の表示順序（委任先→定義→例外→参照→未確認→未解決）
 * が正しくソートされることを検証する。
 *
 * 前提: docker compose up -d + npm run migrate（0008 含む）が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types.js";
import { createTestDb, truncateAll } from "../helpers/db.js";
import {
  listReferenceEdgesBySource,
  insertReferenceEdge,
} from "../../src/db/repos/reference-edge-repo.js";

let db: Kysely<Database>;

beforeAll(async () => {
  db = createTestDb();
});

afterAll(async () => {
  await db?.destroy();
});

beforeEach(async () => {
  await truncateAll(db);
});

/**
 * テスト用: source + provision を最小構成で作成し、provisionId を返す。
 */
async function seedProvision(): Promise<string> {
  const sourceId = randomUUID();
  const provisionId = randomUUID();
  const sourceVersionId = randomUUID();

  await db.insertInto("source").values({
    source_id: sourceId,
    canonical_uri: `jp/law/test-${sourceId.slice(0, 8)}`,
    title: "テスト法令",
    publisher: "日本国",
    authority_class: "PRIMARY_LAW",
    jurisdiction: "jp",
    source_type: "EGOV_LAW",
    status: "ACTIVE",
  }).execute();

  await db.insertInto("source_version").values({
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
  }).execute();

  await db.insertInto("provision").values({
    provision_id: provisionId,
    source_id: sourceId,
    canonical_path: "Article/1",
    provision_type: "ARTICLE",
    stable_label: "第一条",
  }).execute();

  await db.insertInto("provision_version").values({
    provision_version_id: randomUUID(),
    provision_id: provisionId,
    source_version_id: sourceVersionId,
    citation_anchor: `jp/law/test-${sourceId.slice(0, 8)}#Art1`,
    heading: "（目的）",
    body: "この法律は……",
    body_normalized: "この法律は……",
    content_fingerprint: "fp001",
    sequence: 1,
    valid_from: new Date("2025-04-01"),
    valid_from_status: "FIXED",
  }).execute();

  return provisionId;
}

describe("listReferenceEdgesBySource", () => {
  it("§19.5 規範順でソートされる（RESOLVED → UNCONFIRMED → UNRESOLVED）", async () => {
    const provisionId = await seedProvision();

    // 意図的に規範順と逆に投入
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "消防法第17条",
      edgeType: "CITES",
      resolutionStatus: "UNRESOLVED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "別表第一（候補）",
      edgeType: "CITES",
      resolutionStatus: "UNCONFIRMED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "令第126条の2",
      edgeType: "DELEGATES_TO",
      resolutionStatus: "RESOLVED",
    });

    const edges = await listReferenceEdgesBySource(db, provisionId);

    expect(edges).toHaveLength(3);
    expect(edges[0].resolution_status).toBe("RESOLVED");
    expect(edges[0].edge_type).toBe("DELEGATES_TO");
    expect(edges[1].resolution_status).toBe("UNCONFIRMED");
    expect(edges[2].resolution_status).toBe("UNRESOLVED");
  });

  it("RESOLVED 内では edge_type 順（DELEGATES_TO → DEFINES → EXCEPTS → CITES）", async () => {
    const provisionId = await seedProvision();

    // CITES → EXCEPTS → DEFINES → DELEGATES_TO の順で投入（規範順の逆）
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "第20条",
      edgeType: "CITES",
      resolutionStatus: "RESOLVED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "第129条の13の3",
      edgeType: "EXCEPTS",
      resolutionStatus: "RESOLVED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "第2条第1項第九号の二",
      edgeType: "DEFINES",
      resolutionStatus: "RESOLVED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "令第126条の2",
      edgeType: "DELEGATES_TO",
      resolutionStatus: "RESOLVED",
    });

    const edges = await listReferenceEdgesBySource(db, provisionId);

    expect(edges.map((e) => e.edge_type)).toEqual([
      "DELEGATES_TO",
      "DEFINES",
      "EXCEPTS",
      "CITES",
    ]);
  });

  it("他の条文の参照エッジは含まれない", async () => {
    const provisionId1 = await seedProvision();
    const provisionId2 = await seedProvision();

    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId1,
      targetLabel: "第一条への参照",
      edgeType: "CITES",
      resolutionStatus: "RESOLVED",
    });
    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId2,
      targetLabel: "第二条への参照",
      edgeType: "CITES",
      resolutionStatus: "RESOLVED",
    });

    const edges1 = await listReferenceEdgesBySource(db, provisionId1);
    const edges2 = await listReferenceEdgesBySource(db, provisionId2);

    expect(edges1).toHaveLength(1);
    expect(edges1[0].target_label).toBe("第一条への参照");
    expect(edges2).toHaveLength(1);
    expect(edges2[0].target_label).toBe("第二条への参照");
  });

  it("参照エッジがない場合は空配列", async () => {
    const provisionId = await seedProvision();

    const edges = await listReferenceEdgesBySource(db, provisionId);
    expect(edges).toEqual([]);
  });

  it("source_text_span が正しく保存・取得される", async () => {
    const provisionId = await seedProvision();

    await insertReferenceEdge(db, {
      sourceProvisionId: provisionId,
      targetLabel: "令第126条の2",
      edgeType: "DELEGATES_TO",
      resolutionStatus: "RESOLVED",
      sourceTextSpan: { start: 42, end: 58 },
    });

    const edges = await listReferenceEdgesBySource(db, provisionId);
    expect(edges[0].source_text_span).toEqual({ start: 42, end: 58 });
  });
});
