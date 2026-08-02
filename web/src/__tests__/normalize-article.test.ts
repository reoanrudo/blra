import { describe, it, expect } from "vitest";
import { kanjiToArabic, normalizeArticleNumber } from "@/lib/article/normalize-article";

describe("kanjiToArabic", () => {
  it("converts single-digit kanji", () => {
    expect(kanjiToArabic("一")).toBe("1");
    expect(kanjiToArabic("二")).toBe("2");
    expect(kanjiToArabic("三")).toBe("3");
    expect(kanjiToArabic("九")).toBe("9");
  });

  it("converts 十 (10) without leading digit", () => {
    expect(kanjiToArabic("十")).toBe("10");
  });

  it("converts teens (十一〜十九)", () => {
    expect(kanjiToArabic("十一")).toBe("11");
    expect(kanjiToArabic("十五")).toBe("15");
    expect(kanjiToArabic("十九")).toBe("19");
  });

  it("converts tens (二十〜九十)", () => {
    expect(kanjiToArabic("二十")).toBe("20");
    expect(kanjiToArabic("五十")).toBe("50");
    expect(kanjiToArabic("九十")).toBe("90");
  });

  it("converts compound tens (二十一, 七十七)", () => {
    expect(kanjiToArabic("二十一")).toBe("21");
    expect(kanjiToArabic("四十八")).toBe("48");
    expect(kanjiToArabic("七十七")).toBe("77");
    expect(kanjiToArabic("八十七")).toBe("87");
    expect(kanjiToArabic("九十九")).toBe("99");
  });

  it("converts hundreds (百, 二百, 百二十八)", () => {
    expect(kanjiToArabic("百")).toBe("100");
    expect(kanjiToArabic("二百")).toBe("200");
    expect(kanjiToArabic("百二十八")).toBe("128");
    expect(kanjiToArabic("三百五十六")).toBe("356");
  });

  it("converts thousands (千, 千七百七十七)", () => {
    expect(kanjiToArabic("千")).toBe("1000");
    expect(kanjiToArabic("千七百七十七")).toBe("1777");
  });

  it("passes through arabic digits unchanged", () => {
    expect(kanjiToArabic("128")).toBe("128");
    expect(kanjiToArabic("1")).toBe("1");
    expect(kanjiToArabic("999")).toBe("999");
  });

  it("converts full-width digits to half-width", () => {
    expect(kanjiToArabic("１２８")).toBe("128");
    expect(kanjiToArabic("３")).toBe("3");
  });

  it("returns non-kanji non-digit strings unchanged", () => {
    expect(kanjiToArabic("abc")).toBe("abc");
    expect(kanjiToArabic("")).toBe("");
  });
});

describe("normalizeArticleNumber", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizeArticleNumber(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeArticleNumber("")).toBeUndefined();
  });

  it("normalizes single kanji number", () => {
    expect(normalizeArticleNumber("二十一")).toBe("21");
  });

  it("normalizes の-separated article numbers", () => {
    expect(normalizeArticleNumber("七十七の四十二")).toBe("77の42");
    expect(normalizeArticleNumber("二の二")).toBe("2の2");
    expect(normalizeArticleNumber("八の三")).toBe("8の3");
  });

  it("normalizes triple の form", () => {
    expect(normalizeArticleNumber("六十八の二十の三")).toBe("68の20の3");
  });

  it("passes through already-normalized numbers", () => {
    expect(normalizeArticleNumber("128")).toBe("128");
    expect(normalizeArticleNumber("128の3")).toBe("128の3");
  });
});
