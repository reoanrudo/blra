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
