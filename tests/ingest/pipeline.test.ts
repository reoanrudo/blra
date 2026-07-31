/**
 * パイプライン統合テスト。
 * 実際の PostgreSQL（Docker Compose）を使い、Fetcher をモックして minimal-law.xml を流し込む。
 *
 * M3 の Exit Criteria の核心。設計書 §8.1 パイプライン完成の検証。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "kysely";
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestDb } from "../helpers/db.js";
import type { FetchResult } from "../../src/ingest/types.js";
import { ingestSourceVersion } from "../../src/ingest/pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(join(__dirname, "../fixtures/minimal-law.xml"), "utf-8");

let db = createTestDb();

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await sql`TRUNCATE provision_version, provision, source_version, source RESTART IDENTITY CASCADE`.execute(db);
});

// Fetcher のモック: minimal-law.xml を返す
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

describe("ingestSourceVersion: E2E正常取込", () => {
  it("XML → source/source_version/provision/provision_version が全て作成される", async () => {
    const result = await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });

    expect(result.status).toBe("INGESTED");
    expect(result.segmentCount).toBeGreaterThan(0);
    expect(result.extractionRate).toBeGreaterThanOrEqual(0.95);

    // source が1件
    const sourceCount = await db.selectFrom("source")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(sourceCount.count)).toBe(1);

    // source_version が1件
    const svCount = await db.selectFrom("source_version")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(svCount.count)).toBe(1);

    // provision が複数件
    const provCount = await db.selectFrom("provision")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(provCount.count)).toBeGreaterThan(5);

    // provision_version が provision と同数
    const pvCount = await db.selectFrom("provision_version")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(pvCount.count)).toBe(Number(provCount.count));
  });

  it("published_at がセットされる（validation合格版）", async () => {
    const result = await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });

    expect(result.status).toBe("INGESTED");

    const sv = await db.selectFrom("source_version")
      .select(["published_at", "processing_status"])
      .executeTakeFirstOrThrow();
    expect(sv.published_at).not.toBeNull();
    expect(sv.processing_status).toBe("PUBLISHED");
  });

  it("valid_from が設定され、valid_from_status が FIXED になる", async () => {
    await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });

    const sv = await db.selectFrom("source_version")
      .select(["valid_from", "valid_from_status"])
      .executeTakeFirstOrThrow();
    expect(sv.valid_from).not.toBeNull();
    expect(sv.valid_from_status).toBe("FIXED");
  });

  it("Raw保存とDBの整合: raw_object_key のファイルが実際に存在する", async () => {
    const result = await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });

    // raw_object_key からファイルパスを復元
    const sv = await db.selectFrom("source_version")
      .select("raw_object_key")
      .executeTakeFirstOrThrow();

    expect(sv.raw_object_key).toContain(result.sourceId);
    expect(sv.raw_object_key).toMatch(/\.xml$/);

    // ファイルが実際に存在する（data/raw 配下）
    const fullPath = join(process.cwd(), "data", "raw", sv.raw_object_key);
    expect(existsSync(fullPath)).toBe(true);
    const content = await readFile(fullPath, "utf-8");
    expect(content).toContain("<Law>");
  });
});

describe("ingestSourceVersion: 冪等性", () => {
  it("同一 content_hash で2回目は SKIP、DB行は増えない", async () => {
    // 1回目
    const result1 = await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });
    expect(result1.status).toBe("INGESTED");

    // 2回目（同じXML = 同じ content_hash）
    const result2 = await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });
    expect(result2.status).toBe("SKIPPED");
    expect(result2.sourceVersionId).toBe(result1.sourceVersionId);

    // source_version は1件のまま
    const svCount = await db.selectFrom("source_version")
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(svCount.count)).toBe(1);
  });
});

describe("ingestSourceVersion: canonical_path 一意性", () => {
  it("同一 source 内で canonical_path の重複無し", async () => {
    await ingestSourceVersion(db, "325AC0000000201", {
      fetcher: mockFetcher(),
    });

    // canonical_path の重複を検索
    const dupes = await sql`
      SELECT canonical_path, COUNT(*) as cnt
      FROM provision
      GROUP BY canonical_path
      HAVING COUNT(*) > 1
    `.execute(db);

    expect(dupes.rows).toHaveLength(0);
  });
});

describe("ingestSourceVersion: Review判定", () => {
  it("Parser エラーがある場合は PENDING_REVIEW（published_at = NULL）", async () => {
    // 重複 canonical_path を持つ壊れたXMLで Fetcher をモック。
    // valid_from を UNDETERMINED（施行日なし）にすることで、EXCLUDE 制約と
    // UNIQUE(citation_anchor, valid_from) 制約（NULL は distinct 扱い）の
    // 違反を回避しつつ、Parser の canonical_path 重複エラーだけで Review へ飛ばす。
    const brokenFetcher = async (): Promise<FetchResult> => ({
      lawInfo: {
        law_type: "Constitution",
        law_id: "325ACBROKEN",
        law_num: "テスト壊れ法",
        promulgation_date: "2025-01-01",
      },
      revisionInfo: {
        law_revision_id: "broken",
        law_title: "テスト壊れ法",
        // amendment_enforcement_date を意図的に省略 → valid_from = null / UNDETERMINED
      },
      // 同じ Article Num="1" が2回出現 → canonical_path 重複
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<Law>
  <LawBody>
    <LawTitle>テスト壊れ法</LawTitle>
    <MainProvision>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1">
          <ParagraphSentence>本文1</ParagraphSentence>
        </Paragraph>
      </Article>
      <Article Num="1">
        <ArticleTitle>第一条</ArticleTitle>
        <Paragraph Num="1">
          <ParagraphSentence>本文2</ParagraphSentence>
        </Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>`,
    });

    const result = await ingestSourceVersion(db, "325ACBROKEN", {
      fetcher: brokenFetcher,
    });

    expect(result.status).toBe("PENDING_REVIEW");
    expect(result.validationErrors.some((e) => e.level === "error")).toBe(true);

    const sv = await db.selectFrom("source_version")
      .select(["published_at", "processing_status"])
      .where("content_hash", "=", result.contentHash)
      .executeTakeFirstOrThrow();
    expect(sv.published_at).toBeNull();
    expect(sv.processing_status).toBe("PENDING_REVIEW");
  });
});
