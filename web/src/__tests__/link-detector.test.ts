import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectReferences,
  mergeLinkArrays,
} from "@/lib/link/link-detector";
import type { OutgoingLinkRow } from "@/lib/link/link";

// ─── Constants matching link-detector.ts ───

const KENCHIKU_HOU = "325AC0000000201";
const KENCHIKU_REI = "325CO0000000338";

// ─── detectReferences tests (pure regex, no DB) ───

describe("detectReferences", () => {
  it("detects 法第87条", () => {
    const refs = detectReferences("法第八十七条の規定により", KENCHIKU_REI);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("法第八十七条");
    expect(refs[0].articleNumberNormalized).toBe("87");
    expect(refs[0].targetEgovLawId).toBe(KENCHIKU_HOU);
    expect(refs[0].targetLevel).toBe("article");
  });

  it("detects 法第87条第1項", () => {
    const refs = detectReferences("法第八十七条第一項の規定により", KENCHIKU_REI);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("法第八十七条");
    expect(refs[0].articleNumberNormalized).toBe("87");
  });

  it("detects 令第128条の3 (条の〇 form)", () => {
    const refs = detectReferences("令第百二十八条の三第一項", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("令第百二十八条の三");
    expect(refs[0].articleNumberNormalized).toBe("128の3");
    expect(refs[0].targetEgovLawId).toBe(KENCHIKU_REI);
  });

  it("detects same-law 第48条 reference", () => {
    const refs = detectReferences("第四十八条の規定するところにより", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("第四十八条");
    expect(refs[0].articleNumberNormalized).toBe("48");
    expect(refs[0].targetEgovLawId).toBe(KENCHIKU_HOU);
  });

  it("detects 別表第一", () => {
    const refs = detectReferences("別表第一の規定により", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("別表第一");
    expect(refs[0].articleNumberNormalized).toBe("1");
    expect(refs[0].targetLevel).toBe("appdx_table");
  });

  it("detects 付表第二", () => {
    const refs = detectReferences("付表第二に定める", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("付表第二");
    expect(refs[0].articleNumberNormalized).toBe("2");
    expect(refs[0].targetLevel).toBe("appdx_table");
  });

  it("detects 第77条の42 (nested の form)", () => {
    const refs = detectReferences("第七十七条の四十二第一項", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("第七十七条の四十二");
    expect(refs[0].articleNumberNormalized).toBe("77の42");
  });

  it("detects range reference endpoints (から〜まで)", () => {
    const refs = detectReferences(
      "第四十八条から第四十九条の二まで",
      KENCHIKU_HOU,
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe("第四十八条");
    expect(refs[0].articleNumberNormalized).toBe("48");
    expect(refs[1].text).toBe("第四十九条の二");
    expect(refs[1].articleNumberNormalized).toBe("49の2");
  });

  it("detects multiple refs in one text", () => {
    const refs = detectReferences(
      "法第二十一条第一項及び法第三十条第二項",
      KENCHIKU_REI,
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe("法第二十一条");
    expect(refs[1].text).toBe("法第三十条");
  });

  it("does NOT match 第1項 (項 is not 条)", () => {
    const refs = detectReferences("第一項の規定により", KENCHIKU_HOU);
    expect(refs).toHaveLength(0);
  });

  it("does NOT match 第1号 (号 is not 条)", () => {
    const refs = detectReferences("第一号に掲げる", KENCHIKU_HOU);
    expect(refs).toHaveLength(0);
  });

  it("does NOT double-match 法第X条 (cross-law takes priority)", () => {
    const refs = detectReferences("法第八十七条", KENCHIKU_REI);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetEgovLawId).toBe(KENCHIKU_HOU);
  });

  it("same-law pattern resolves to current egovLawId", () => {
    const refs = detectReferences("第二十一条の二", KENCHIKU_REI);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetEgovLawId).toBe(KENCHIKU_REI);
  });

  it("returns empty for text with no references", () => {
    const refs = detectReferences("この法律の目的は、建築物の安全を確保することである。", KENCHIKU_HOU);
    expect(refs).toHaveLength(0);
  });

  it("handles arabic digit article numbers", () => {
    const refs = detectReferences("第128条の3の規定により", KENCHIKU_HOU);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("第128条の3");
    expect(refs[0].articleNumberNormalized).toBe("128の3");
  });

  it("handles 法第X条 with arabic digits", () => {
    const refs = detectReferences("法第52条第1項第5号", KENCHIKU_REI);
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("法第52条");
    expect(refs[0].articleNumberNormalized).toBe("52");
  });
});

// ─── mergeLinkArrays tests ───

describe("mergeLinkArrays", () => {
  function makeLink(
    id: string,
    sourceRange: string,
    resolved: boolean,
  ): OutgoingLinkRow {
    return {
      id,
      sourceId: "src",
      targetId: resolved ? "target-1" : null,
      linkType: resolved ? "internal" : "unresolved",
      sourceRange,
      isResolved: resolved,
      targetLawName: null,
      targetText: null,
      targetArticleNumberNormalized: null,
      targetArticleNumber: null,
      targetCaption: null,
      targetLawShortName: null,
    };
  }

  it("returns existing-only when no runtime links", () => {
    const existing = [makeLink("e1", "10-20", true)];
    const merged = mergeLinkArrays(existing, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("e1");
  });

  it("appends non-overlapping runtime links", () => {
    const existing = [makeLink("e1", "10-20", true)];
    const runtime = [makeLink("r1", "30-40", true)];
    const merged = mergeLinkArrays(existing, runtime);
    expect(merged).toHaveLength(2);
  });

  it("skips runtime links overlapping with existing", () => {
    const existing = [makeLink("e1", "10-25", true)];
    const runtime = [makeLink("r1", "15-20", true)];
    const merged = mergeLinkArrays(existing, runtime);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("e1");
  });

  it("handles empty existing array", () => {
    const runtime = [makeLink("r1", "10-20", true)];
    const merged = mergeLinkArrays([], runtime);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("r1");
  });

  it("skips runtime links with null sourceRange", () => {
    const runtime = [makeLink("r1", "10-20", true)];
    runtime[0].sourceRange = null;
    const merged = mergeLinkArrays([], runtime);
    expect(merged).toHaveLength(0);
  });
});
