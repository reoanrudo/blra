# S1 M3: 取込パイプライン実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** e-Gov API から建築基準法を取得し、Raw保存 → Parser → DB書込 → Validation → 自動Publish までの取込パイプラインを完成させる。

**Architecture:** パイプライン本体は `ingestSourceVersion(db, lawId, options)` の単一関数。Kysely インスタンスと Fetcher を依存注入し、CLI（`npm run ingest`）から呼ぶ。DB書込は1トランザクション。Fetcher はテスト時にモック可能。

**Tech Stack:** TypeScript / Node 22, Kysely + pg, e-Gov API v2（fetch）, fast-xml-parser（既存M2依存）, Vitest

**Spec:** `docs/superpowers/specs/2026-07-30-s1-m3-ingestion-pipeline-design.md`

**前提条件:** `docker compose up -d` + `npm run migrate` が完了済み（M1と同じ前提）。`npm test` が現状 green。

---

## ファイル構造

```text
src/
  ingest/                              ← M3 新規
    types.ts                           FetchResult, IngestOptions, PipelineResult, RevisionInfo, LawInfo 型
    fetcher.ts                         e-Gov API v2 クライアント（fetchLawRevision, リトライ付き）
    raw-store.ts                       ローカルFSへの原本保存・読込（saveRawArtifact, readRawArtifact）
    validation.ts                      抽出率・文字化けチェック（validatePipeline, shouldPublish）
    pipeline.ts                        ingestSourceVersion() — 全ステージを統合するメイン関数
  cli/
    ingest.ts                          npm run ingest のエントリポイント
  db/
    repos/                             ← M3 新規
      source-repo.ts                   source / source_version の UPSERT・検索
      provision-repo.ts                provision / provision_version の UPSERT・バッチINSERT
  config.ts                            ← EGOV_API_BASE, RAW_DATA_DIR を追加

tests/
  ingest/
    fetcher.test.ts                    Fetcher 単体（モックHTTP）
    raw-store.test.ts                  Raw保存単体（実際のFS・一時ディレクトリ）
    validation.test.ts                 Validation 純関数
    pipeline.test.ts                   パイプライン統合テスト（実際のDB）
  fixtures/
    mock-egov-responses/               ← M3 新規
      revisions-325AC0000000201.json   law_revisions API のモックレスポンス
      lawdata-325AC0000000201.xml      law_data API のモックレスポンス（minimal-law.xml をラップ）
```

---

## Task 1: 型定義と設定（`types.ts` + `config.ts` 更新）

パイプライン全体で使う型と、環境変数を定義する。これが後続タスクの依存の基盤になる。

**Files:**
- Create: `src/ingest/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: `src/ingest/types.ts` を作成**

```typescript
/**
 * 取込パイプラインの型定義。
 * Fetcher / RawStore / Validation / Pipeline が共有する。
 * 設計書 §8.1（パイプライン）、§4.2（法令時間モデル）に対応。
 */

// === e-Gov API レスポンスの型 ===
// spike/src/lib/egov.ts の RevisionInfo / LawInfo と同じ構造。
// M3 の Fetcher は JSON モード（law_revisions）と XML モード（law_data）を使う。

export interface LawInfo {
  law_type: string;
  law_id: string;
  law_num: string;
  promulgation_date: string;
}

export interface RevisionInfo {
  law_revision_id: string;
  law_title: string;
  /** 施行日。この版が効力を持ち始める日（設計書 §4.2 valid_from） */
  amendment_enforcement_date?: string;
  /** 施行予定日。施行日が未確定の場合のみ入る（§4.2 valid_from_status = UNDETERMINED） */
  amendment_scheduled_enforcement_date?: string;
  amendment_promulgate_date?: string;
  amendment_law_id?: string;
  amendment_law_num?: string;
  amendment_type?: string;
  current_revision_status?: string;
  repeal_status?: string;
  repeal_date?: string | null;
}

/** law_revisions API のレスポンス */
export interface LawRevisionsResponse {
  law_info: LawInfo;
  revisions: RevisionInfo[];
}

// === Fetcher の入出力 ===

export interface FetchResult {
  lawInfo: LawInfo;
  revisionInfo: RevisionInfo;
  /** 法令標準XML 全文（response_format=xml の生文字列） */
  xml: string;
}

// === パイプラインの入出力 ===

export interface IngestOptions {
  /** Fetcher 関数。テスト時にモックへ差し替えるため依存注入。 */
  fetcher?: (lawId: string) => Promise<FetchResult>;
}

export type IngestStatus = "INGESTED" | "SKIPPED" | "PENDING_REVIEW";

export interface PipelineResult {
  status: IngestStatus;
  sourceId: string;
  sourceVersionId: string;
  contentHash: string;
  segmentCount: number;
  extractionRate: number;
  validationErrors: { level: "error" | "warning"; message: string }[];
  rawObjectKey: string;
}

// === valid_from 導出の結果 ===
// 設計書 §4.2: amendment_enforcement_date → FIXED、
// amendment_scheduled_enforcement_date → UNDETERMINED、どちらも無し → UNDETERMINED

export interface ValidFromResult {
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
}
```

- [ ] **Step 2: `src/config.ts` へ EGOV_API_BASE と RAW_DATA_DIR を追加**

既存の `config.ts` を読み、`as const` のオブジェクトへ2行を追加する。

`src/config.ts` の `export const config = { ... } as const;` へ以下を追加:

```typescript
export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: parseInt(optional("PORT", "3000"), 10),
  host: optional("HOST", "0.0.0.0"),
  logLevel: optional("LOG_LEVEL", "info"),
  // e-Gov 法令API v2 のベースURL（認証不要）
  egovApiBase: optional("EGOV_API_BASE", "https://laws.e-gov.go.jp/api/2"),
  // 原本XMLの保存先ディレクトリ（ローカルFS。§8.2-2 原本は先に残す）
  rawDataDir: optional("RAW_DATA_DIR", "data/raw"),
} as const;
```

- [ ] **Step 3: `.env.example` へ追記**

`.env.example` の末尾へ追加:

```
# e-Gov 法令API v2（認証不要・デフォルト値で動作）
# EGOV_API_BASE=https://laws.e-gov.go.jp/api/2

# 原本XML保存先（デフォルト: data/raw）
# RAW_DATA_DIR=data/raw
```

- [ ] **Step 4: 型チェックでコンパイルエラーがないことを確認**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/ingest/types.ts src/config.ts .env.example
git commit -m "feat(s1-m3): パイプライン型定義 + config へ e-Gov/Raw設定を追加"
```

---

## Task 2: content_hash 計算ユーティリティ（`src/ingest/hash.ts`）

原本XML全体の SHA-256 先頭16文字を計算する。複数モジュール（raw-store, pipeline）で使うため独立ファイルにする。

**Files:**
- Create: `src/ingest/hash.ts`

- [ ] **Step 1: `src/ingest/hash.ts` を作成**

```typescript
/**
 * content_hash 計算ユーティリティ。
 *
 * 設計書 §8.1: Raw Artifact を保存した後に Hash 比較を行う。
 * §13.1: source_version の content_hash 列。UNIQUE(source_id, content_hash) 制約。
 *
 * ハッシュ対象は原本XML全文。SHA-256 の hex 先頭16文字。
 * 衝突耐性: 2^128 分の1。同一 Source 内での版同定用途には十分。
 */

import { createHash } from "node:crypto";

/**
 * 原本XML文字列から content_hash を計算する。
 * @param xml 法令標準XML 全文
 * @returns SHA-256 hex 先頭16文字
 */
export function computeContentHash(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex").slice(0, 16);
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/ingest/hash.ts
git commit -m "feat(s1-m3): content_hash 計算ユーティリティ（SHA-256 先頭16文字）"
```

---

## Task 3: Raw Artifact Store（`src/ingest/raw-store.ts` + テスト）

原本XMLをローカルFSへ保存する。§8.2-2「Parser が落ちても原本は残す」を満たす最初のステップ。

**Files:**
- Create: `src/ingest/raw-store.ts`
- Test: `tests/ingest/raw-store.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/ingest/raw-store.test.ts` を作成:

```typescript
/**
 * raw-store.ts のユニットテスト。
 * 実際のFS（os.tmpdir 配下の一時ディレクトリ）を使う。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveRawArtifact, readRawArtifact } from "../../src/ingest/raw-store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "blra-raw-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("saveRawArtifact", () => {
  it("正常保存: {tempDir}/{sourceId}/{hash}.xml が作成される", async () => {
    const xml = "<Law><LawBody/></Law>";
    const result = await saveRawArtifact({
      xml,
      sourceId: "source-001",
      contentHash: "abcdef0123456789",
      baseDir: tempDir,
    });

    expect(result).toBe("source-001/abcdef0123456789.xml");

    // ファイルが実際に存在し、内容が一致する
    const saved = await readFile(join(tempDir, "source-001", "abcdef0123456789.xml"), "utf-8");
    expect(saved).toBe(xml);
  });

  it("冪等保存: 同じハッシュで2回保存 → ファイル1つ（上書きされる）", async () => {
    const xml = "<Law/>";
    await saveRawArtifact({ xml, sourceId: "s1", contentHash: "hash001", baseDir: tempDir });
    await saveRawArtifact({ xml, sourceId: "s1", contentHash: "hash001", baseDir: tempDir });

    // 同じパスへ2回書いてもエラーにならず、内容が保持される
    const saved = await readRawArtifact({ objectKey: "s1/hash001.xml", baseDir: tempDir });
    expect(saved).toBe(xml);
  });

  it("異なる sourceId は別ディレクトリに保存される", async () => {
    await saveRawArtifact({ xml: "<A/>", sourceId: "s1", contentHash: "h1", baseDir: tempDir });
    await saveRawArtifact({ xml: "<B/>", sourceId: "s2", contentHash: "h2", baseDir: tempDir });

    const a = await readRawArtifact({ objectKey: "s1/h1.xml", baseDir: tempDir });
    const b = await readRawArtifact({ objectKey: "s2/h2.xml", baseDir: tempDir });
    expect(a).toBe("<A/>");
    expect(b).toBe("<B/>");
  });
});

describe("readRawArtifact", () => {
  it("保存したファイルを復元できる", async () => {
    const xml = "<Law>復元テスト</Law>";
    await saveRawArtifact({ xml, sourceId: "s-read", contentHash: "h-read", baseDir: tempDir });

    const restored = await readRawArtifact({ objectKey: "s-read/h-read.xml", baseDir: tempDir });
    expect(restored).toBe(xml);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/ingest/raw-store.test.ts`
Expected: FAIL（`saveRawArtifact` が未定義）

- [ ] **Step 3: 実装を書く**

`src/ingest/raw-store.ts` を作成:

```typescript
/**
 * 原本XMLのローカルファイルシステム保存・読込。
 *
 * 設計書 §8.1: Raw Artifact Store — Object Storage へ原本を先に保存。
 * M3 では Object Storage の代わりにローカルFS を使う。
 * raw_object_key 列に相対パス（"{sourceId}/{hash}.xml"）を格納する。
 * 将来 S3 へ移行する場合はこのモジュールの実装を差し替えるだけでよい。
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { config } from "../config.js";

interface SaveParams {
  xml: string;
  sourceId: string;
  contentHash: string;
  /** テスト用に上書き可能。省略時は config.rawDataDir */
  baseDir?: string;
}

interface ReadParams {
  /** saveRawArtifact が返した objectKey */
  objectKey: string;
  /** テスト用に上書き可能。省略時は config.rawDataDir */
  baseDir?: string;
}

/**
 * 原本XMLを保存し、raw_object_key（相対パス）を返す。
 * 同じ contentHash で再保存した場合は上書きされる（冪等）。
 */
export async function saveRawArtifact(params: SaveParams): Promise<string> {
  const base = params.baseDir ?? config.rawDataDir;
  const objectKey = `${params.sourceId}/${params.contentHash}.xml`;
  const fullPath = join(base, objectKey);

  // ディレクトリが無ければ作成（recursive で親も含む）
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, params.xml, "utf-8");

  return objectKey;
}

/**
 * 保存した原本XMLを読み込む。
 */
export async function readRawArtifact(params: ReadParams): Promise<string> {
  const base = params.baseDir ?? config.rawDataDir;
  const fullPath = join(base, params.objectKey);
  return readFile(fullPath, "utf-8");
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run tests/ingest/raw-store.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add src/ingest/raw-store.ts tests/ingest/raw-store.test.ts
git commit -m "feat(s1-m3): Raw Artifact Store（ローカルFS保存・読込）"
```

---

## Task 4: Fetcher（`src/ingest/fetcher.ts` + テスト）

e-Gov API v2 から現行版の法令XMLを取得する。spike の知見を本実装へ昇華する。リトライ付き。

**Files:**
- Create: `src/ingest/fetcher.ts`
- Test: `tests/ingest/fetcher.test.ts`
- Create: `tests/fixtures/mock-egov-responses/revisions-325AC0000000201.json`
- Create: `tests/fixtures/mock-egov-responses/lawdata-325AC0000000201.xml`

- [ ] **Step 1: モックレスポンスのフィクスチャを作成**

`tests/fixtures/mock-egov-responses/revisions-325AC0000000201.json` を作成:

```json
{
  "law_info": {
    "law_type": "Constitution",
    "law_id": "325AC0000000201",
    "law_num": "昭和二十五年法律第二百一号",
    "promulgation_date": "1950-05-24"
  },
  "revisions": [
    {
      "law_revision_id": "325AC0000000201_20250401",
      "law_title": "建築基準法",
      "amendment_enforcement_date": "2025-04-01",
      "amendment_promulgate_date": "2024-12-11",
      "amendment_law_id": "336CO0000000115",
      "amendment_law_num": "令和六年政令第百十五号",
      "amendment_type": "改正",
      "current_revision_status": "現行"
    }
  ]
}
```

`tests/fixtures/mock-egov-responses/lawdata-325AC0000000201.xml` を作成（`minimal-law.xml` を `<Law>` でラップした実用的なモック）:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Law>
  <LawNum>昭和二十五年法律第二百一号</LawNum>
  <LawBody>
    <LawTitle>建築基準法</LawTitle>
    <MainProvision>
      <Chapter Num="1">
        <ChapterTitle>第一章　総則</ChapterTitle>
        <Article Num="1">
          <ArticleCaption>（目的）</ArticleCaption>
          <ArticleTitle>第一条</ArticleTitle>
          <Paragraph Num="1">
            <ParagraphNum>１</ParagraphNum>
            <ParagraphSentence>この法律は、建築物の敷地、構造、設備及び用途に関する最低の基準を定めることを目的とする。</ParagraphSentence>
          </Paragraph>
        </Article>
      </Chapter>
    </MainProvision>
  </LawBody>
</Law>
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/ingest/fetcher.test.ts` を作成:

```typescript
/**
 * fetcher.ts のユニットテスト。
 * HTTP は vi.spyOn(globalThis, "fetch") でモック。実際の e-Gov API にはアクセスしない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLawRevision, validateXmlStructure, EgovApiError } from "../../src/ingest/fetcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_DIR = join(__dirname, "../fixtures/mock-egov-responses");

const MOCK_REVISIONS = JSON.parse(
  readFileSync(join(MOCK_DIR, "revisions-325AC0000000201.json"), "utf-8"),
);
const MOCK_LAWDATA_XML = readFileSync(join(MOCK_DIR, "lawdata-325AC0000000201.xml"), "utf-8");

function mockResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": status === 200 ? "application/json" : "text/plain" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateXmlStructure", () => {
  it("正常なXMLは例外を投げない", () => {
    expect(() => validateXmlStructure(MOCK_LAWDATA_XML)).not.toThrow();
  });

  it("<Law> が無い場合は例外", () => {
    expect(() => validateXmlStructure("<NotLaw/>")).toThrow(EgovApiError);
  });

  it("<MainProvision> が無い場合は例外", () => {
    expect(() => validateXmlStructure("<Law><LawBody/></Law>")).toThrow(EgovApiError);
  });
});

describe("fetchLawRevision", () => {
  it("正常取得: FetchResult が正しく組み立てられる", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/law_revisions/")) {
        return mockResponse(JSON.stringify(MOCK_REVISIONS));
      }
      if (url.includes("/law_data/")) {
        return new Response(MOCK_LAWDATA_XML, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }
      return mockResponse("not found", 404);
    });

    const result = await fetchLawRevision("325AC0000000201");

    expect(result.lawInfo.law_id).toBe("325AC0000000201");
    expect(result.lawInfo.law_num).toBe("昭和二十五年法律第二百一号");
    expect(result.revisionInfo.law_revision_id).toBe("325AC0000000201_20250401");
    expect(result.revisionInfo.amendment_enforcement_date).toBe("2025-04-01");
    expect(result.xml).toContain("<Law>");
    expect(result.xml).toContain("<MainProvision>");

    // 2回呼ばれる（law_revisions + law_data）
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("最新版を取得する（revisions 配列の最初）", async () => {
    const multiRevisions = {
      ...MOCK_REVISIONS,
      revisions: [
        MOCK_REVISIONS.revisions[0],
        {
          ...MOCK_REVISIONS.revisions[0],
          law_revision_id: "325AC0000000201_20200101",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/law_revisions/")) {
        return mockResponse(JSON.stringify(multiRevisions));
      }
      return new Response(MOCK_LAWDATA_XML, { status: 200 });
    });

    const result = await fetchLawRevision("325AC0000000201");
    expect(result.revisionInfo.law_revision_id).toBe("325AC0000000201_20250401");
  });

  it("4xx エラーは即失敗（リトライしない）", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return mockResponse("Not Found", 404);
    });

    await expect(fetchLawRevision("INVALID_ID")).rejects.toThrow(EgovApiError);
    // リトライせず1回のみ
    expect(callCount).toBe(1);
  });

  it("5xx エラーは3回リトライ後に失敗", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      return mockResponse("Internal Server Error", 500);
    });

    // タイムアウトを短くするためモック環境では現実的な待機を期待
    await expect(fetchLawRevision("325AC0000000201")).rejects.toThrow();
    // 初回 + 3回リトライ = 4回
    expect(callCount).toBe(4);
  }, 15000);

  it("5xx→200 のパターンでリトライ後に成功", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      callCount++;
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/law_revisions/")) {
        // 1回目は500、2回目は200
        if (callCount === 1) {
          return mockResponse("Server Error", 500);
        }
        return mockResponse(JSON.stringify(MOCK_REVISIONS));
      }
      return new Response(MOCK_LAWDATA_XML, { status: 200 });
    });

    const result = await fetchLawRevision("325AC0000000201");
    expect(result.lawInfo.law_id).toBe("325AC0000000201");
  }, 15000);
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `npx vitest run tests/ingest/fetcher.test.ts`
Expected: FAIL（`fetchLawRevision` 等が未定義）

- [ ] **Step 4: 実装を書く**

`src/ingest/fetcher.ts` を作成:

```typescript
/**
 * e-Gov 法令API v2 クライアント。
 *
 * spike (spikes/src/lib/egov.ts) で実測済みのエンドポイントを本実装へ昇華。
 * 認証不要。設計書 §8.1 Fetcher ステージ、§8.2-5 At-Least-Once。
 *
 * エンドポイント（全て GET、BASE = https://laws.e-gov.go.jp/api/2）:
 *   /law_revisions/{lawId}    → 版一覧（JSON）
 *   /law_data/{revisionId}?response_format=xml  → 法令標準XML全文
 */

import { config } from "../config.js";
import type {
  FetchResult,
  LawInfo,
  LawRevisionsResponse,
  RevisionInfo,
} from "./types.js";

/** e-Gov API 関連のエラー */
export class EgovApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "EgovApiError";
  }
}

const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/**
 * HTTP GET をリトライ付きで実行する。
 * 5xx・ネットワークエラーのみリトライ。4xx は即失敗。
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });

      // 4xx は即失敗（リトライしない）
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => "");
        throw new EgovApiError(
          `e-Gov API が ${res.status} を返しました: ${body}`,
          res.status,
        );
      }

      // 5xx はリトライ
      if (res.status >= 500) {
        lastError = new EgovApiError(
          `e-Gov API が ${res.status} を返しました`,
          res.status,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      return res;
    } catch (err) {
      // AbortError（タイムアウト）やネットワークエラーもリトライ対象
      if (err instanceof EgovApiError && err.statusCode && err.statusCode < 500) {
        throw err; // 4xx はリトライしない
      }
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("到達不能");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 法令標準XML の構造をバリデーションする。
 * hourei-rag の fetch-laws.ts と同じチェック。
 */
export function validateXmlStructure(xml: string): void {
  if (!xml.includes("<Law") || !xml.includes("<MainProvision")) {
    throw new EgovApiError(
      "法令標準XMLの構造が不正です（<Law> または <MainProvision> が見つかりません）",
    );
  }
}

/**
 * lawId の現行版（最新 revision）を取得する。
 *
 * 1. /law_revisions/{lawId} → revisions 配列の最初（最新）を取得
 * 2. /law_data/{revisionId}?response_format=xml → XML本文
 * 3. XML構造バリデーション
 */
export async function fetchLawRevision(lawId: string): Promise<FetchResult> {
  const base = config.egovApiBase;

  // 1. 版一覧取得
  const revisionsUrl = `${base}/law_revisions/${lawId}`;
  const revisionsRes = await fetchWithRetry(revisionsUrl);
  const revisionsData = (await revisionsRes.json()) as LawRevisionsResponse;

  if (!revisionsData.revisions || revisionsData.revisions.length === 0) {
    throw new EgovApiError(`lawId ${lawId} の版が見つかりません`);
  }

  // 最新版（配列の最初）を取得
  const revisionInfo: RevisionInfo = revisionsData.revisions[0]!;
  const lawInfo: LawInfo = revisionsData.law_info;

  // 2. 法令本文取得
  const lawDataUrl = `${base}/law_data/${revisionInfo.law_revision_id}?response_format=xml`;
  const lawDataRes = await fetchWithRetry(lawDataUrl);
  const xml = await lawDataRes.text();

  // 3. XML構造バリデーション
  validateXmlStructure(xml);

  return { lawInfo, revisionInfo, xml };
}
```

- [ ] **Step 5: テストを実行してパスを確認**

Run: `npx vitest run tests/ingest/fetcher.test.ts`
Expected: PASS（7件）

※ リトライテストのウェイト（1s+2s+4s）があるため、テスト完了まで最大10秒程度かかる。`testTimeout: 30000`（vitest.config.ts）の範囲内。

- [ ] **Step 6: コミット**

```bash
git add src/ingest/fetcher.ts tests/ingest/fetcher.test.ts tests/fixtures/mock-egov-responses/
git commit -m "feat(s1-m3): e-Gov API Fetcher（リトライ付き・XMLバリデーション）"
```

---

## Task 5: valid_from 導出ユーティリティ（`src/ingest/valid-from.ts` + テスト）

e-Gov API の `revision_info` から `valid_from` と `valid_from_status` を導出する。設計書 §4.2 の中核ロジック。

**Files:**
- Create: `src/ingest/valid-from.ts`
- Test: `tests/ingest/valid-from.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/ingest/valid-from.test.ts` を作成:

```typescript
/**
 * valid-from.ts のユニットテスト。
 * e-Gov API revision_info → §4.2 valid_from / valid_from_status の導出を検証。
 */
import { describe, it, expect } from "vitest";
import { deriveValidFrom } from "../../src/ingest/valid-from.js";
import type { RevisionInfo } from "../../src/ingest/types.js";

describe("deriveValidFrom", () => {
  it("amendment_enforcement_date がある場合は FIXED", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_enforcement_date: "2025-04-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("FIXED");
    expect(result.validFrom).toEqual(new Date("2025-04-01"));
  });

  it("amendment_enforcement_date 無し・scheduled がある場合は UNDETERMINED", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_scheduled_enforcement_date: "2025-06-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("UNDETERMINED");
    expect(result.validFrom).toBeNull();
  });

  it("どちらも無い場合は UNDETERMINED + validFrom=null", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("UNDETERMINED");
    expect(result.validFrom).toBeNull();
  });

  it("enforcement より scheduled が優先されることはない（enforcement 第一優先）", () => {
    const revision: RevisionInfo = {
      law_revision_id: "rev1",
      law_title: "テスト法",
      amendment_enforcement_date: "2025-04-01",
      amendment_scheduled_enforcement_date: "2025-06-01",
    };
    const result = deriveValidFrom(revision);
    expect(result.validFromStatus).toBe("FIXED");
    expect(result.validFrom).toEqual(new Date("2025-04-01"));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/ingest/valid-from.test.ts`
Expected: FAIL（`deriveValidFrom` が未定義）

- [ ] **Step 3: 実装を書く**

`src/ingest/valid-from.ts` を作成:

```typescript
/**
 * e-Gov API revision_info から valid_from / valid_from_status を導出する。
 *
 * 設計書 §4.2 法令時間モデル:
 *  - amendment_enforcement_date がある → FIXED（施行日確定）
 *  - amendment_enforcement_date 無し・scheduled がある → UNDETERMINED（施行日未確定）
 *  - どちらも無い → UNDETERMINED + validFrom=null
 *
 * ESTIMATED（推測日付）は M3 では使わない（§4.2「推測で表示することを禁じる」の精神）。
 */

import type { RevisionInfo, ValidFromResult } from "./types.js";

export function deriveValidFrom(revision: RevisionInfo): ValidFromResult {
  // enforcement_date があれば確定（第一優先）
  if (revision.amendment_enforcement_date) {
    return {
      validFrom: new Date(revision.amendment_enforcement_date),
      validFromStatus: "FIXED",
    };
  }

  // scheduled は参考情報として保持するが、施行日は未確定なので validFrom は null
  // （scheduled を仮の validFrom に入れると時点検索が静かに誤る。§4.2）
  return {
    validFrom: null,
    validFromStatus: "UNDETERMINED",
  };
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run tests/ingest/valid-from.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add src/ingest/valid-from.ts tests/ingest/valid-from.test.ts
git commit -m "feat(s1-m3): valid_from 導出ロジック（§4.2 法令時間モデル）"
```

---

## Task 6: Validation（`src/ingest/validation.ts` + テスト）

抽出率・文字化けチェックを行い、Publish 可否を判定する。設計書 §8.3。

**Files:**
- Create: `src/ingest/validation.ts`
- Test: `tests/ingest/validation.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/ingest/validation.test.ts` を作成:

```typescript
/**
 * validation.ts のユニットテスト。
 * 抽出率・文字化けチェック、Publish 可否判定を検証。
 * 設計書 §8.3 Validation。
 */
import { describe, it, expect } from "vitest";
import { validatePipeline, shouldPublish } from "../../src/ingest/validation.js";
import type { ValidationError } from "../../src/parser/types.js";
import type { ParseStats } from "../../src/parser/types.js";

describe("validatePipeline: 抽出率", () => {
  it("抽出率95%以上は warning 無し", () => {
    const stats: ParseStats = {
      totalChars: 10000,
      capturedChars: 9600,
      extractionRate: 0.96,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings).toHaveLength(0);
  });

  it("抽出率95%未満は warning", () => {
    const stats: ParseStats = {
      totalChars: 10000,
      capturedChars: 9000,
      extractionRate: 0.90,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings.length).toBeGreaterThan(0);
    expect(rateWarnings[0]!.level).toBe("warning");
  });

  it("抽出率0%（totalChars=0）は warning 無し（空データの境界）", () => {
    const stats: ParseStats = {
      totalChars: 0,
      capturedChars: 0,
      extractionRate: 1,
    };
    const errors = validatePipeline(stats, [], []);
    const rateWarnings = errors.filter((e) => e.message.includes("抽出率"));
    expect(rateWarnings).toHaveLength(0);
  });
});

describe("validatePipeline: 文字化け検出", () => {
  it("正常な本文は warning 無し", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const bodies = ["建築物の敷地は、道路に二メートル以上接しなければならない。"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings).toHaveLength(0);
  });

  it("C0制御文字の混入は warning", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    // タブ(0x09)・改行(LF)以外の制御文字が混入
    const bodies = ["テスト\x01\x02本文"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings.length).toBeGreaterThan(0);
  });

  it("タブ・改行は文字化け扱いしない", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const bodies = ["テスト\t本文\n次行"];
    const errors = validatePipeline(stats, [], bodies);
    const garbledWarnings = errors.filter((e) => e.message.includes("文字化け"));
    expect(garbledWarnings).toHaveLength(0);
  });
});

describe("validatePipeline: Parser層エラーの集約", () => {
  it("Parser の error がそのまま集約される", () => {
    const stats: ParseStats = {
      totalChars: 100,
      capturedChars: 100,
      extractionRate: 1,
    };
    const parserErrors: ValidationError[] = [
      { level: "error", message: "canonical_path 重複: art1" },
      { level: "warning", message: "本文が空: art2/para1" },
    ];
    const errors = validatePipeline(stats, parserErrors, ["正常本文"]);
    // Parser の error + warning が含まれる
    expect(errors.some((e) => e.message.includes("canonical_path 重複"))).toBe(true);
    expect(errors.some((e) => e.message.includes("本文が空"))).toBe(true);
  });
});

describe("shouldPublish", () => {
  it("error無し・warning閾値内は true", () => {
    const errors: ValidationError[] = [
      { level: "warning", message: "軽微な警告1" },
      { level: "warning", message: "軽微な警告2" },
    ];
    expect(shouldPublish(errors)).toBe(true);
  });

  it("error 1件でもあれば false", () => {
    const errors: ValidationError[] = [
      { level: "error", message: "重大エラー" },
    ];
    expect(shouldPublish(errors)).toBe(false);
  });

  it("warning が閾値（10件）超は false", () => {
    const errors: ValidationError[] = Array.from({ length: 11 }, (_, i) => ({
      level: "warning" as const,
      message: `警告${i}`,
    }));
    expect(shouldPublish(errors)).toBe(false);
  });

  it("error無し・warning10件ちょうどは true", () => {
    const errors: ValidationError[] = Array.from({ length: 10 }, (_, i) => ({
      level: "warning" as const,
      message: `警告${i}`,
    }));
    expect(shouldPublish(errors)).toBe(true);
  });

  it("エラー・警告ゼロは true", () => {
    expect(shouldPublish([])).toBe(true);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/ingest/validation.test.ts`
Expected: FAIL（`validatePipeline`, `shouldPublish` が未定義）

- [ ] **Step 3: 実装を書く**

`src/ingest/validation.ts` を作成:

```typescript
/**
 * パイプライン後段の Validation。
 *
 * 設計書 §8.3 Validation で落とすもの:
 *  - 抽出率の異常（95%未満）
 *  - 文字化けの疑い（制御文字の混入）
 *  - Parser 層のエラー（M2 validateSegments の結果を集約）
 *
 * 前版 Provision 消失比較は現行版1つのためスキップ（Phase 2 で複数版時）。
 */

import type { ParseStats, ValidationError } from "../parser/types.js";

/** 抽出率の warning 閾値 */
const EXTRACTION_RATE_THRESHOLD = 0.95;

/** 文字化け判定の制御文字パターン（タブ0x09・改行0x0A・復帰0x0D 以外の C0制御文字） */
const GARBLED_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Publish 判定の warning 数上限（これ超は Review 行き） */
const MAX_WARNINGS_FOR_PUBLISH = 10;

/**
 * パイプライン全体の Validation を行う。
 * Parser層エラー + 抽出率 + 文字化けチェックを統合する。
 *
 * @param stats Parser の抽出率統計
 * @param parserErrors Parser（M2 validateSegments）のエラー
 * @param bodies 全 segment の本文（文字化けチェック用）
 * @returns 統合された Validation エラー・警告リスト
 */
export function validatePipeline(
  stats: ParseStats,
  parserErrors: ValidationError[],
  bodies: string[],
): ValidationError[] {
  const errors: ValidationError[] = [...parserErrors];

  // 1. 抽出率チェック（§8.3）
  if (stats.totalChars > 0 && stats.extractionRate < EXTRACTION_RATE_THRESHOLD) {
    errors.push({
      level: "warning",
      message: `抽出率が閾値を下回っています: ${(stats.extractionRate * 100).toFixed(1)}% (閾値 ${EXTRACTION_RATE_THRESHOLD * 100}%)`,
    });
  }

  // 2. 文字化けチェック（§8.3: 文字化けの疑い）
  const garbledCount = bodies.filter((b) => GARBLED_CHAR_PATTERN.test(b)).length;
  if (garbledCount > 0) {
    errors.push({
      level: "warning",
      message: `文字化けの疑い: ${garbledCount} 件の本文に制御文字が混入しています`,
    });
  }

  return errors;
}

/**
 * Validation 結果から Publish 可否を判定する。
 * §8.3: error が1件でもある、または warning が閾値超なら Review Queue 行き。
 *
 * @param errors validatePipeline の戻り値
 * @returns true = 自動Publish、false = Review Queue（published_at = NULL）
 */
export function shouldPublish(errors: ValidationError[]): boolean {
  const hasError = errors.some((e) => e.level === "error");
  if (hasError) return false;

  const warningCount = errors.filter((e) => e.level === "warning").length;
  return warningCount <= MAX_WARNINGS_FOR_PUBLISH;
}
```

- [ ] **Step 4: テストを実行してパスを確認**

Run: `npx vitest run tests/ingest/validation.test.ts`
Expected: PASS（11件）

- [ ] **Step 5: コミット**

```bash
git add src/ingest/validation.ts tests/ingest/validation.test.ts
git commit -m "feat(s1-m3): パイプライン Validation（抽出率・文字化け・Publish判定）"
```

---

## Task 7: DBリポジトリ（`src/db/repos/source-repo.ts`）

source / source_version の UPSERT・検索。Kysely の onConflict を使う。

**Files:**
- Create: `src/db/repos/source-repo.ts`

- [ ] **Step 1: 実装を書く**

`src/db/repos/source-repo.ts` を作成:

```typescript
/**
 * source / source_version テーブルのリポジトリ。
 *
 * 設計書 §13.1 物理設計、§8.2 冪等性。
 * Kysely の onConflict で UPSERT を実現する。
 */

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../types.js";
import type { LawInfo } from "../../ingest/types.js";

/**
 * canonical_uri で source を UPSERT し、source_id を返す。
 * 既存の場合は title 等を更新（改正でタイトルが変わる可能性）。
 */
export async function upsertSource(
  db: Kysely<Database>,
  lawInfo: LawInfo,
): Promise<string> {
  // canonical_uri は設計書 §13.1: "{jurisdiction}/{sourceIdentity}" 形式
  const canonicalUri = `jp/law/${lawInfo.law_id}`;

  const result = await db
    .insertInto("source")
    .values({
      source_id: randomUUID(),
      canonical_uri: canonicalUri,
      title: lawInfo.law_num, // 法令番号をタイトルの代わり（最も安定した識別子）
      publisher: "日本国",
      authority_class: "PRIMARY_LAW",
      jurisdiction: "jp",
      source_type: "EGOV_LAW",
      status: "ACTIVE",
    })
    .onConflict((oc) => oc.column("canonical_uri"))
    .doUpdateSet({
      title: lawInfo.law_num,
    })
    .returning("source_id")
    .executeTakeFirstOrThrow();

  return result.source_id;
}

/**
 * content_hash で既存の source_version を検索する。
 * §8.2-1 冪等: 同じ content_hash があれば以降をスキップ。
 */
export async function findSourceVersionByHash(
  db: Kysely<Database>,
  sourceId: string,
  contentHash: string,
): Promise<{ source_version_id: string } | undefined> {
  return db
    .selectFrom("source_version")
    .select("source_version_id")
    .where("source_id", "=", sourceId)
    .where("content_hash", "=", contentHash)
    .executeTakeFirst();
}

export interface CreateSourceVersionParams {
  sourceId: string;
  contentHash: string;
  rawObjectKey: string;
  parserVersion: string;
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
  promulgatedAt: Date | null;
  publishedAt: Date | null;
  processingStatus: string;
}

/**
 * source_version を新規作成する。
 * UNIQUE(source_id, content_hash) 制約で重複を防ぐ。
 */
export async function createSourceVersion(
  db: Kysely<Database>,
  params: CreateSourceVersionParams,
): Promise<string> {
  const result = await db
    .insertInto("source_version")
    .values({
      source_version_id: randomUUID(),
      source_id: params.sourceId,
      content_hash: params.contentHash,
      raw_object_key: params.rawObjectKey,
      parser_version: params.parserVersion,
      consolidation_state: "OFFICIAL_CONSOLIDATED",
      verification_status: "MECHANICAL",
      promulgated_at: params.promulgatedAt,
      valid_from: params.validFrom,
      valid_from_status: params.validFromStatus,
      retrieved_at: new Date(),
      processing_status: params.processingStatus,
      published_at: params.publishedAt,
    })
    .returning("source_version_id")
    .executeTakeFirstOrThrow();

  return result.source_version_id;
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/db/repos/source-repo.ts
git commit -m "feat(s1-m3): source/source_version リポジトリ（UPSERT・Hash検索）"
```

---

## Task 8: DBリポジトリ（`src/db/repos/provision-repo.ts`）

provision / provision_version の UPSERT・バッチINSERT。

**Files:**
- Create: `src/db/repos/provision-repo.ts`

- [ ] **Step 1: 実装を書く**

`src/db/repos/provision-repo.ts` を作成:

```typescript
/**
 * provision / provision_version テーブルのリポジトリ。
 *
 * 設計書 §6.1 Citation Anchor、§6.3 Anchor の版間移行、§13.1 物理設計。
 *
 * provision は UNIQUE(source_id, canonical_path) で UPSERT。
 * 同一 canonical_path は provision_id を安定させる（§6.3 版間移行）。
 * provision_version はバッチINSERT（hourei-rag 踏襷、バッチサイズ500）。
 */

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database, ProvisionType } from "../types.js";
import type { ProvisionSegment } from "../../parser/types.js";

const BATCH_SIZE = 500;

/**
 * provision_type の文字列 → enum 値へのマッピング。
 * Parser の ProvisionType（string union）と DB の provision_type_enum を橋渡し。
 */
function toDbType(type: ProvisionSegment["provisionType"]): ProvisionType {
  return type;
}

/**
 * 単一 provision を UPSERT し、provision_id を返す。
 * 既存（同一 source_id + canonical_path）なら provision_id を再利用（§6.3）。
 */
export async function upsertProvision(
  db: Kysely<Database>,
  sourceId: string,
  segment: ProvisionSegment,
): Promise<string> {
  const result = await db
    .insertInto("provision")
    .values({
      provision_id: randomUUID(),
      source_id: sourceId,
      canonical_path: segment.canonicalPath,
      provision_type: toDbType(segment.provisionType),
      stable_label: segment.stableLabel,
    })
    .onConflict((oc) => oc.columns(["source_id", "canonical_path"]))
    .doUpdateSet({
      stable_label: segment.stableLabel,
      provision_type: toDbType(segment.provisionType),
    })
    .returning("provision_id")
    .executeTakeFirstOrThrow();

  return result.provision_id;
}

export interface ProvisionVersionRowInput {
  provisionId: string;
  sourceVersionId: string;
  segment: ProvisionSegment;
  validFrom: Date | null;
  validFromStatus: "FIXED" | "UNDETERMINED";
}

/**
 * provision_version をバッチINSERTする。
 * バッチサイズ500で分割（hourei-rag 踏襷）。
 */
export async function insertProvisionVersions(
  db: Kysely<Database>,
  rows: ProvisionVersionRowInput[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insertInto("provision_version")
      .values(
        batch.map((r) => ({
          provision_version_id: randomUUID(),
          provision_id: r.provisionId,
          source_version_id: r.sourceVersionId,
          citation_anchor: r.segment.citationAnchor,
          heading: r.segment.heading || null,
          body: r.segment.body,
          body_normalized: r.segment.bodyNormalized,
          content_fingerprint: r.segment.contentFingerprint,
          text_quote_prefix: r.segment.textQuotePrefix || null,
          text_quote_suffix: r.segment.textQuoteSuffix || null,
          sequence: r.segment.sequence,
          valid_from: r.validFrom,
          valid_from_status: r.validFromStatus,
        })),
      )
      .execute();
  }
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/db/repos/provision-repo.ts
git commit -m "feat(s1-m3): provision/provision_version リポジトリ（UPSERT・バッチINSERT）"
```

---

## Task 9: パイプライン統合（`src/ingest/pipeline.ts`）

全ステージを統合するメイン関数。§8.1 パイプラインの完成形。

**Files:**
- Create: `src/ingest/pipeline.ts`

- [ ] **Step 1: 実装を書く**

`src/ingest/pipeline.ts` を作成:

```typescript
/**
 * 取込パイプラインのメイン関数。
 *
 * 設計書 §8.1 パイプラインの完成形:
 *   Fetcher → Raw保存 → Hash比較 → Parser → Validation → DB書込 → Publish
 *
 * §8.2-2: Raw Artifact を最初に保存する（Parser が落ちても原本は残す）。
 * §8.2-6: DB書込はトランザクション内で行う。
 *
 * 依存注入: db と fetcher を引数で受け取る。テスト時にモック可能。
 * CLI と将来の HTTP API の両方から呼べる。
 */

import type { Kysely } from "kysely";
import { parse, PARSER_VERSION } from "../parser/index.js";
import type { ProvisionSegment } from "../parser/types.js";
import { fetchLawRevision } from "./fetcher.js";
import { saveRawArtifact } from "./raw-store.js";
import { computeContentHash } from "./hash.js";
import { deriveValidFrom } from "./valid-from.js";
import { validatePipeline, shouldPublish } from "./validation.js";
import { upsertSource, findSourceVersionByHash, createSourceVersion } from "../db/repos/source-repo.js";
import { upsertProvision, insertProvisionVersions } from "../db/repos/provision-repo.js";
import type { FetchResult, IngestOptions, PipelineResult } from "./types.js";

/**
 * 法令1版を取込む。
 *
 * @param db Kysely インスタンス
 * @param lawId e-Gov 法令ID（例: "325AC0000000201" = 建築基準法）
 * @param options.fetcher テスト時にモックへ差し替え可能
 * @returns 取込結果
 */
export async function ingestSourceVersion(
  db: Kysely<Database>,
  lawId: string,
  options?: IngestOptions,
): Promise<PipelineResult> {
  const fetcher = options?.fetcher ?? fetchLawRevision;

  // === ステージ1: Fetcher ===
  const fetched: FetchResult = await fetcher(lawId);

  // === ステージ2: source の UPSERT（トランザクション外で source_id を先に確保） ===
  const sourceId = await upsertSource(db, fetched.lawInfo);

  // === ステージ3: content_hash 計算 + Raw保存 ===
  const contentHash = computeContentHash(fetched.xml);
  const rawObjectKey = await saveRawArtifact({
    xml: fetched.xml,
    sourceId,
    contentHash,
  });

  // === ステージ4: Hash比較（冪等性） ===
  const existing = await findSourceVersionByHash(db, sourceId, contentHash);
  if (existing) {
    return {
      status: "SKIPPED",
      sourceId,
      sourceVersionId: existing.source_version_id,
      contentHash,
      segmentCount: 0,
      extractionRate: 0,
      validationErrors: [],
      rawObjectKey,
    };
  }

  // === ステージ5: Parser ===
  const { output, errors: parserErrors } = parse({
    xml: fetched.xml,
    jurisdiction: "jp",
    sourceIdentity: `law/${fetched.lawInfo.law_id}`,
  });

  // === ステージ6: valid_from 導出（§4.2） ===
  const { validFrom, validFromStatus } = deriveValidFrom(fetched.revisionInfo);

  // === ステージ7: Validation ===
  const bodies = output.segments.map((s: ProvisionSegment) => s.body);
  const validationErrors = validatePipeline(output.stats, parserErrors, bodies);
  const willPublish = shouldPublish(validationErrors);

  // === ステージ8: DB書込（トランザクション） ===
  const result = await db.transaction().execute(async (trx) => {
    // source_version 作成
    const promulgatedAt = fetched.lawInfo.promulgation_date
      ? new Date(fetched.lawInfo.promulgation_date)
      : null;

    const sourceVersionId = await createSourceVersion(trx, {
      sourceId,
      contentHash,
      rawObjectKey,
      parserVersion: PARSER_VERSION,
      validFrom,
      validFromStatus,
      promulgatedAt,
      publishedAt: willPublish ? new Date() : null,
      processingStatus: willPublish ? "PUBLISHED" : "PENDING_REVIEW",
    });

    // provision + provision_version 書込
    const versionRows = [];
    for (const segment of output.segments) {
      const provisionId = await upsertProvision(trx, sourceId, segment);
      versionRows.push({
        provisionId,
        sourceVersionId,
        segment,
        validFrom,
        validFromStatus,
      });
    }

    await insertProvisionVersions(trx, versionRows);

    return sourceVersionId;
  });

  return {
    status: willPublish ? "INGESTED" : "PENDING_REVIEW",
    sourceId,
    sourceVersionId: result,
    contentHash,
    segmentCount: output.segments.length,
    extractionRate: output.stats.extractionRate,
    validationErrors,
    rawObjectKey,
  };
}
```

※ `import type { Kysely } from "kysely"` と `import type { Database } from "../db/types.js"` が必要。`Database` 型が `pipeline.ts` の `db.transaction()` で使われるため。

上記のコードへ以下の import をファイル先頭へ追加:

```typescript
import type { Database } from "../db/types.js";
```

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add src/ingest/pipeline.ts
git commit -m "feat(s1-m3): 取込パイプライン統合関数 ingestSourceVersion()"
```

---

## Task 10: パイプライン統合テスト（`tests/ingest/pipeline.test.ts`）

M3 の Exit Criteria の核心。実際のPostgreSQLでE2Eを検証する。

**Files:**
- Test: `tests/ingest/pipeline.test.ts`

- [ ] **Step 1: テストを書く**

`tests/ingest/pipeline.test.ts` を作成:

```typescript
/**
 * パイプライン統合テスト。
 * 実際の PostgreSQL（Docker Compose）を使い、Fetcher をモックして minimal-law.xml を流し込む。
 *
 * M3 の Exit Criteria の核心。設計書 §8.1 パイプライン完成の検証。
 *
 * 前提: docker compose up -d + npm run migrate が完了済み。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "../../src/db/types.js";
import type { FetchResult } from "../../src/ingest/types.js";
import { ingestSourceVersion } from "../../src/ingest/pipeline.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(join(__dirname, "../fixtures/minimal-law.xml"), "utf-8");

let db: Kysely<Database>;
let tempRawDir: string;

beforeAll(async () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://blra:blra_dev@localhost:5433/blra",
  });
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  // テスト用の Raw 保存先（data/raw と衝突しない一時ディレクトリ）
  tempRawDir = join(tmpdir(), `blra-pipeline-test-${Date.now()}`);
});

afterAll(async () => {
  await db?.destroy();
  // 一時ディレクトリのクリーンアップ
  await rm(tempRawDir, { recursive: true, force: true }).catch(() => {});
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
    // 重複 canonical_path を持つ壊れたXMLで Fetcher をモック
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
        amendment_enforcement_date: "2025-04-01",
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
```

※ `tmpdir` と `rm` の import を追加する必要がある。ファイル先頭へ:

```typescript
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
```

- [ ] **Step 2: テストを実行**

Run: `npx vitest run tests/ingest/pipeline.test.ts`
Expected: PASS（7件）

※ このテストは実際のDBを使う。`docker compose up -d` + `npm run migrate` が前提。

- [ ] **Step 3: コミット**

```bash
git add tests/ingest/pipeline.test.ts
git commit -m "test(s1-m3): パイプライン統合テスト（実際のDB・E2E検証）"
```

---

## Task 11: CLI エントリ（`src/cli/ingest.ts`）

`npm run ingest` でパイプラインを起動する。

**Files:**
- Create: `src/cli/ingest.ts`
- Modify: `package.json`

- [ ] **Step 1: CLI を作成**

`src/cli/ingest.ts` を作成:

```typescript
#!/usr/bin/env tsx
/**
 * 取込パイプラインのCLIエントリ。
 *
 * Usage:
 *   npm run ingest                    # 建築基準法の現行版を取込
 *   npm run ingest -- 325AC0000000201 # law_id 指定
 *
 * M4 で HTTP API（POST /corpus/...）が追加された際は、
 * このスクリプトと同じ ingestSourceVersion() を呼ぶ薄いラッパーになる。
 */

import { db, closeDatabase } from "../db/connection.js";
import { ingestSourceVersion } from "../ingest/pipeline.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lawId = args.find((a) => !a.startsWith("-")) ?? "325AC0000000201";

  console.log(`=== 法令取込パイプライン ===`);
  console.log(`対象 lawId: ${lawId}\n`);

  try {
    const result = await ingestSourceVersion(db, lawId);

    console.log(`\n=== 取込結果 ===`);
    console.log(`  状態: ${result.status}`);
    console.log(`  sourceId: ${result.sourceId}`);
    console.log(`  sourceVersionId: ${result.sourceVersionId}`);
    console.log(`  contentHash: ${result.contentHash}`);
    console.log(`  segment数: ${result.segmentCount}`);
    console.log(`  抽出率: ${(result.extractionRate * 100).toFixed(2)}%`);
    console.log(`  rawObjectKey: ${result.rawObjectKey}`);

    if (result.validationErrors.length > 0) {
      console.log(`\n  Validation エラー・警告 (${result.validationErrors.length}件):`);
      for (const e of result.validationErrors) {
        console.log(`    [${e.level}] ${e.message}`);
      }
    }

    if (result.status === "INGESTED") {
      console.log(`\n✓ 取込完了（公開済み）`);
    } else if (result.status === "SKIPPED") {
      console.log(`\n→ スキップ（既存の同一版）`);
    } else {
      console.log(`\n⚠ Review待ち（公開されません）`);
    }
  } catch (err) {
    console.error("\n✗ 取込エラー:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

main();
```

- [ ] **Step 2: package.json へスクリプトを追加**

`package.json` の `"scripts"` へ以下を追加（`"migrate:create"` の後ろなど）:

```json
    "ingest": "tsx src/cli/ingest.ts",
```

- [ ] **Step 3: .gitignore へ data/raw/ を追加**

`.gitignore` の最後へ追加:

```
# 取込パイプラインの原本XML（再取得可能）
data/raw/
```

- [ ] **Step 4: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add src/cli/ingest.ts package.json .gitignore
git commit -m "feat(s1-m3): CLI エントリ（npm run ingest）+ data/raw を gitignore へ追加"
```

---

## Task 12: 全テスト実行 + E2Eデモ

全テストが green であることを確認し、実際のe-Gov APIでE2Eデモを行う。

- [ ] **Step 1: 全テスト実行**

Run: `npm test`
Expected: 全テスト PASS（M1/M2既存テスト + M3新規テスト）

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: E2Eデモ（実際のe-Gov API）**

Run: `npm run ingest`
Expected: 建築基準法が実際に取得・取込・公開される。出力に `✓ 取込完了（公開済み）` と表示される。

確認ポイント:
- 抽出率が95%以上（健全なXMLなら99%以上を期待）
- segment数が数百件以上（建基法の規模）
- `data/raw/` 配下にXMLファイルが作成されている

- [ ] **Step 4: DB確認**

```bash
# source_version が1件、published_at がセットされている
docker compose exec postgres psql -U blra -d blra -c \
  "SELECT source_version_id, content_hash, processing_status, published_at FROM source_version;"

# provision 数
docker compose exec postgres psql -U blra -d blra -c \
  "SELECT COUNT(*) FROM provision;"

# provision_version 数
docker compose exec postgres psql -U blra -d blra -c \
  "SELECT COUNT(*) FROM provision_version;"
```

- [ ] **Step 5: HANDOFF.md 更新**

`docs/HANDOFF.md` の状態表と「次にやること」を M3 完了状態へ更新。

- [ ] **Step 6: 最終コミット**

```bash
git add docs/HANDOFF.md
git commit -m "docs: 引き継ぎプロンプトを S1 M3 完了状態へ更新"
```

---

## セルフレビュー

### Spec coverage（設計書スペックとの対応）

| 設計スペックの要件 | 対応タスク |
|---|---|
| §8.1 Fetcher | Task 4 |
| §8.1 Raw Artifact Store（ローカルFS） | Task 3 |
| §8.1 Hash Comparison | Task 2 + Task 9（pipeline.ts ステージ4） |
| §8.1 Parser（M2流用） | Task 9（pipeline.ts ステージ5） |
| §8.1 Validation | Task 6 |
| §8.1 DB書込 | Task 7, 8, 9 |
| §8.1 Publish | Task 9（pipeline.ts ステージ8） |
| §8.2-1 冪等性 | Task 7（findSourceVersionByHash）+ Task 10（テスト） |
| §8.2-2 原本保存 | Task 3 + Task 10（テスト） |
| §8.2-5 At-Least-Once | Task 4（リトライ） |
| §8.3 Validation（抽出率・文字化け） | Task 6 |
| §4.2 valid_from 導出 | Task 5 |
| §6.1 canonical_path 一意性 | Task 8（UPSERT）+ Task 10（テスト） |
| §13.1 UNIQUE(source_id, content_hash) | Task 7 + Task 10（テスト） |
| §15.4 Phase 1 Exit（E2E） | Task 10, 12 |

**ギャップなし。** 全てのスペック要件がタスクへ対応している。

### Placeholder scan

- TBD/TODO/incomplete: なし
- "appropriate error handling": なし（具体的なエラーハンドリングを全て記述）
- "similar to Task N": なし
- 型・関数名の不整合: なし（`ingestSourceVersion`, `fetchLawRevision`, `validatePipeline`, `shouldPublish`, `deriveValidFrom`, `computeContentHash`, `saveRawArtifact`, `upsertSource`, `findSourceVersionByHash`, `createSourceVersion`, `upsertProvision`, `insertProvisionVersions` 全て一貫）

### Type consistency

- `FetchResult`, `RevisionInfo`, `LawInfo`, `LawRevisionsResponse`, `IngestOptions`, `PipelineResult`, `IngestStatus`, `ValidFromResult` — 全て Task 1 で定義、Task 4-9 で使用
- `ValidationError`, `ParseStats` — M2 の `src/parser/types.js` から import
- `ProvisionSegment` — M2 から import
- `Database` — M1 の `src/db/types.js` から import
- Kysely の `onConflict` API の使い方が Task 7, 8 で一貫

問題なし。
