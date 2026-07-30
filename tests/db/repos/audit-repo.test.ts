/**
 * audit-repo のテスト。
 * 監査レコードの書込・検索を検証する。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types.js";
import { createTestDb, truncateAll } from "../../helpers/db.js";
import {
  insertAuditRecord,
  queryAuditRecords,
} from "../../../src/db/repos/audit-repo.js";

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

describe("insertAuditRecord", () => {
  it("監査レコードを追記し audit_id を返す", async () => {
    const auditId = await insertAuditRecord(db, {
      action: "PUBLISH",
      resourceType: "source_version",
      resourceId: "sv-001",
    });

    expect(auditId).toBeTruthy();
    expect(typeof auditId).toBe("string");
  });

  it("オプション項目（beforeHash, afterHash, correlationId, clientContext）を記録する", async () => {
    const correlationId = randomUUID();
    const auditId = await insertAuditRecord(db, {
      action: "INGEST",
      resourceType: "source_version",
      resourceId: "sv-002",
      beforeHash: "abc123",
      afterHash: "def456",
      correlationId,
      clientContext: { lawId: "325AC0000000201", segmentCount: 2264 },
    });

    const records = await queryAuditRecords(db, { resourceId: "sv-002" });
    expect(records).toHaveLength(1);
    expect(records[0]!.audit_id).toBe(auditId);
    expect(records[0]!.action).toBe("INGEST");
    expect(records[0]!.before_hash).toBe("abc123");
    expect(records[0]!.after_hash).toBe("def456");
    expect(records[0]!.correlation_id).toBe(correlationId);
  });

  it("actor_id, organization_id は M4 時点では NULL になる", async () => {
    await insertAuditRecord(db, {
      action: "PUBLISH",
      resourceType: "source_version",
      resourceId: "sv-003",
    });

    const records = await queryAuditRecords(db, { resourceId: "sv-003" });
    expect(records[0]!.actor_id).toBeNull();
    expect(records[0]!.organization_id).toBeNull();
  });
});

describe("queryAuditRecords", () => {
  beforeEach(async () => {
    // テストデータを3件投入
    await insertAuditRecord(db, {
      action: "INGEST",
      resourceType: "source_version",
      resourceId: "sv-A",
    });
    await insertAuditRecord(db, {
      action: "PUBLISH",
      resourceType: "source_version",
      resourceId: "sv-A",
    });
    await insertAuditRecord(db, {
      action: "METADATA_CHANGE",
      resourceType: "source",
      resourceId: "src-B",
    });
  });

  it("全件取得する（デフォルト）", async () => {
    const records = await queryAuditRecords(db);
    expect(records.length).toBeGreaterThanOrEqual(3);
  });

  it("action で絞り込む", async () => {
    const records = await queryAuditRecords(db, { action: "PUBLISH" });
    expect(records).toHaveLength(1);
    expect(records[0]!.action).toBe("PUBLISH");
  });

  it("resourceType で絞り込む", async () => {
    const records = await queryAuditRecords(db, {
      resourceType: "source",
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.resource_type).toBe("source");
  });

  it("resourceId で絞り込む", async () => {
    const records = await queryAuditRecords(db, { resourceId: "sv-A" });
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.resource_id === "sv-A")).toBe(true);
  });

  it("limit で取得件数を制限する", async () => {
    const records = await queryAuditRecords(db, { limit: 1 });
    expect(records).toHaveLength(1);
  });

  it("結果が occurred_at の降順で返る", async () => {
    const records = await queryAuditRecords(db, { limit: 10 });
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.occurred_at.getTime()).toBeLessThanOrEqual(
        records[i - 1]!.occurred_at.getTime(),
      );
    }
  });
});
