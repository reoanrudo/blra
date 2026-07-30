/**
 * segment.ts のユニットテスト。
 *
 * spike (spikes/src/lib/segment.ts) の F-2 パーサーが 99.97% の抽出率を
 * 達成したロジックを踏襲していることを検証する。
 *
 * テスト対象:
 *  - Article / Paragraph / Item / Subitem の階層分解
 *  - canonical_path 生成（art, para, item, "_" → "-" 変換）
 *  - stable_label 生成（第N条、第N項、第N号）
 *  - 附則の名前空間分離（suppl:{amendLawNum}/）
 *  - 別表のタイトルからの canonical_path 生成
 *  - body_normalized / fingerprint / citation_anchor の生成
 *  - Validation（重複検出、空本文検出）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../../src/parser/index.js";
import { fingerprint } from "../../src/parser/normalize.js";
import { validateSegments } from "../../src/parser/segment.js";
import type { ProvisionSegment } from "../../src/parser/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../fixtures/minimal-law.xml");

const FIXTURE_XML = readFileSync(FIXTURE_PATH, "utf-8");

const JURISDICTION = "jp";
const SOURCE_IDENTITY = "law/325AC0000000201";

function parseFixture() {
  return parse({
    xml: FIXTURE_XML,
    jurisdiction: JURISDICTION,
    sourceIdentity: SOURCE_IDENTITY,
  });
}

describe("e-Gov Parser: フィクスチャ全体の構造検証", () => {
  const result = parseFixture();

  it("Parser バージョンが設定されている", () => {
    expect(result.output.parserVersion).toBeTruthy();
    expect(result.output.parserVersion).toMatch(/^egov-xml-/);
  });

  it("抽出率が 95% 以上（フィクスチャは制定文がないので 100% に近い）", () => {
    expect(result.output.stats.extractionRate).toBeGreaterThanOrEqual(0.95);
  });

  it("Validation エラーがない", () => {
    expect(result.errors.filter((e) => e.level === "error")).toEqual([]);
  });
});

describe("e-Gov Parser: 条・項・号の分解", () => {
  const { output } = parseFixture();
  const segments = output.segments;

  it("第1条（Article Num=1）が ARTICLE として分解される", () => {
    const art1 = segments.find((s) => s.canonicalPath === "art1");
    expect(art1).toBeDefined();
    expect(art1!.provisionType).toBe("ARTICLE");
    expect(art1!.stableLabel).toBe("第一条");
    expect(art1!.heading).toBe("（目的）");
  });

  it("第1条第1項が PARAGRAPH として分解される", () => {
    const para = segments.find((s) => s.canonicalPath === "art1/para1");
    expect(para).toBeDefined();
    expect(para!.provisionType).toBe("PARAGRAPH");
    expect(para!.stableLabel).toBe("第一条第1項");
    expect(para!.body).toContain("この法律は");
    expect(para!.body).toContain("目的とする");
  });

  it("第2条第1項第1号が ITEM として分解される", () => {
    const item = segments.find((s) => s.canonicalPath === "art2/para1/item1");
    expect(item).toBeDefined();
    expect(item!.provisionType).toBe("ITEM");
    expect(item!.stableLabel).toContain("第一号");
    expect(item!.body).toContain("「建築物」とは");
  });

  it("号の子号（Subitem1）が分解される", () => {
    const sub = segments.find(
      (s) => s.canonicalPath === "art2/para1/item1/item1",
    );
    expect(sub).toBeDefined();
    expect(sub!.body).toContain("付属建築物");
  });

  it("第52条の2（Article Num=52_2）の canonical_path が art52-2 になる", () => {
    const art = segments.find((s) => s.canonicalPath === "art52-2");
    expect(art).toBeDefined();
    expect(art!.stableLabel).toBe("第五十二条の二");
    expect(art!.heading).toBe("（外壁の後退）");
  });

  it("第52条第2項の号が複数分解される", () => {
    const items = segments.filter(
      (s) => s.provisionType === "ITEM" && s.canonicalPath.startsWith("art52/para2/item"),
    );
    expect(items.length).toBe(2);
  });
});

describe("e-Gov Parser: body_normalized と fingerprint", () => {
  const { output } = parseFixture();

  it("bodyNormalized が正規化されている（NFKC + 空白正規化）", () => {
    const para = output.segments.find((s) => s.canonicalPath === "art1/para1");
    expect(para).toBeDefined();
    // 改行・余分な空白が除去されている
    expect(para!.bodyNormalized).not.toMatch(/\n/);
    expect(para!.bodyNormalized).not.toMatch(/  /);
  });

  it("contentFingerprint が16文字の hex である", () => {
    for (const s of output.segments) {
      expect(s.contentFingerprint).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("同じ本文を持つ segment は同じ fingerprint になる", () => {
    const para1 = output.segments.find((s) => s.canonicalPath === "art1/para1");
    expect(para1).toBeDefined();
    // 同じ本文で再計算
    expect(fingerprint(para1!.bodyNormalized)).toBe(para1!.contentFingerprint);
  });

  it("citationAnchor が jp/law/325AC0000000201/ プレフィックスを持つ", () => {
    const art1 = output.segments.find((s) => s.canonicalPath === "art1");
    expect(art1!.citationAnchor).toBe(
      "jp/law/325AC0000000201/art1",
    );
  });

  it("textQuotePrefix/Suffix が設定される", () => {
    const para = output.segments.find((s) => s.canonicalPath === "art1/para1");
    expect(para).toBeDefined();
    expect(para!.textQuotePrefix.length).toBeGreaterThan(0);
    // 本文が32文字以上なら suffix も設定される
    if (para!.bodyNormalized.length > 32) {
      expect(para!.textQuoteSuffix.length).toBe(32);
    }
  });
});

describe("e-Gov Parser: 附則の名前空間分離", () => {
  const { output } = parseFixture();

  it("附則の Article が SUPPLEMENTARY タイプになる", () => {
    const supplArts = output.segments.filter(
      (s) => s.provisionType === "SUPPLEMENTARY",
    );
    // フィクスチャには2つの附則があり、それぞれ第1条を持つ
    expect(supplArts.length).toBe(2);
  });

  it("附則の canonical_path が suppl: 名前空間で分離される", () => {
    const suppl1 = output.segments.find(
      (s) =>
        s.canonicalPath ===
        "suppl:昭和二十五年法律第二百一号/art1",
    );
    expect(suppl1).toBeDefined();
    expect(suppl1!.amendLawNum).toBe("昭和二十五年法律第二百一号");

    const suppl2 = output.segments.find(
      (s) =>
        s.canonicalPath ===
        "suppl:平成十二年法律第百十五号/art1",
    );
    expect(suppl2).toBeDefined();
    expect(suppl2!.amendLawNum).toBe("平成十二年法律第百十五号");
  });

  it("附則同士の art1/para1 が衝突しない（名前空間で一意化）", () => {
    const supplParas = output.segments.filter(
      (s) => s.provisionType === "PARAGRAPH" && s.canonicalPath.includes("suppl:"),
    );
    const paths = supplParas.map((s) => s.canonicalPath);
    const unique = new Set(paths);
    expect(paths.length).toBe(unique.size);
  });
});

describe("e-Gov Parser: 別表の canonical_path", () => {
  const { output } = parseFixture();

  it("別表が TABLE タイプとして分解される", () => {
    const tables = output.segments.filter((s) => s.provisionType === "TABLE");
    expect(tables.length).toBe(1);
  });

  it("別表の canonical_path がタイトルから生成される（appdx-table-1）", () => {
    const table = output.segments.find((s) => s.provisionType === "TABLE");
    expect(table).toBeDefined();
    // 「別表第一」→ appdx-table-1
    expect(table!.canonicalPath).toBe("appdx-table-1");
    expect(table!.stableLabel).toBe("別表第一");
  });
});

describe("e-Gov Parser: sequence の一貫性", () => {
  const { output } = parseFixture();
  const segments = output.segments;

  it("sequence が 0 から始まり連続している", () => {
    const seqs = segments.map((s) => s.sequence).sort((a, b) => a - b);
    expect(seqs[0]).toBe(0);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1] + 1);
    }
  });
});

describe("e-Gov Parser: Validation", () => {
  it("canonical_path の重複をエラーとして検出する", () => {
    const dupes: ProvisionSegment[] = [
      {
        canonicalPath: "art1/para1",
        stableLabel: "第一条第1項",
        provisionType: "PARAGRAPH",
        heading: "",
        body: "テスト",
        bodyNormalized: "テスト",
        contentFingerprint: "abc123",
        citationAnchor: "jp/law/x/art1/para1",
        textQuotePrefix: "テスト",
        textQuoteSuffix: "",
        sequence: 0,
      },
      {
        canonicalPath: "art1/para1",
        stableLabel: "第一条第1項",
        provisionType: "PARAGRAPH",
        heading: "",
        body: "重複",
        bodyNormalized: "重複",
        contentFingerprint: "def456",
        citationAnchor: "jp/law/x/art1/para1",
        textQuotePrefix: "重複",
        textQuoteSuffix: "",
        sequence: 1,
      },
    ];
    const errors = validateSegments(dupes);
    const pathErrors = errors.filter(
      (e: { message: string }) => e.message.includes("canonical_path 重複"),
    );
    expect(pathErrors.length).toBeGreaterThan(0);
  });
});
