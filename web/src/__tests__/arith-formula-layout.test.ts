import { describe, expect, it } from "vitest";
import { splitArithFormulaLayout, splitFormulaFraction } from "@/lib/article/arith-formula-layout";

describe("splitArithFormulaLayout", () => {
  it("本文、独立した式、記号説明の大括弧部分に分ける", () => {
    const text = [
      "排気筒の有効断面積が、次の式によつて計算した必要有効断面積以上であること。",
      "A_v＝A_f／(250√h)",
      "(この式において、A、A及びhは、それぞれ次の数値を表すものとする。",
      "A　必要有効断面積",
      "h　高さ)",
    ].join("\n");

    expect(splitArithFormulaLayout(text)).toEqual({
      introduction: "排気筒の有効断面積が、次の式によつて計算した必要有効断面積以上であること。",
      introductionStart: 0,
      formula: "A_v＝A_f／(250√h)",
      formulaStart: 38,
      definitions: "この式において、A、A及びhは、それぞれ次の数値を表すものとする。\nA　必要有効断面積\nh　高さ",
      definitionsStart: 55,
    });
  });

  it("式と説明がそろわない本文は通常の組版に任せる", () => {
    expect(splitArithFormulaLayout("次の式を参照する。\nA＝B")).toBeNull();
  });

  it("全角括弧で囲まれた定義部分も正しく分離する（施行令パターン）", () => {
    const text = [
      "排気筒の有効断面積が、次の式によつて計算した必要有効断面積以上であること。",
      "Ａ_ｖ＝Ａ_ｆ／（２５０√ｈ）",
      "（この式において、Ａ、Ａ及びｈは、それぞれ次の数値を表すものとする。",
      "Ａ　必要有効断面積",
      "ｈ　高さ）",
    ].join("\n");

    const result = splitArithFormulaLayout(text);
    expect(result).not.toBeNull();
    expect(result!.formula).toBe("Ａ_ｖ＝Ａ_ｆ／（２５０√ｈ）");
    expect(result!.definitions).toContain("この式において");
    expect(result!.definitions.startsWith("（")).toBe(false);
    expect(result!.definitions.endsWith("）")).toBe(false);
  });
});

describe("splitFormulaFraction", () => {
  it("分母が括弧付きの式を左辺・分子・分母に分ける（括弧を外す）", () => {
    expect(splitFormulaFraction("Ａ_ｖ＝Ａ_ｆ／（２５０√ｈ）")).toEqual({
      leftSide: "Ａ_ｖ",
      numerator: "Ａ_ｆ",
      denominator: "２５０√ｈ",
    });
  });

  it("分母が単一変数の式を左辺・分子・分母に分ける", () => {
    expect(splitFormulaFraction("Ｖ＝２０Ａ_ｆ／Ｎ")).toEqual({
      leftSide: "Ｖ",
      numerator: "２０Ａ_ｆ",
      denominator: "Ｎ",
    });
  });

  it("／ がない式は null（フォールバック）", () => {
    expect(splitFormulaFraction("Ａ＝Ｂ＋Ｃ")).toBeNull();
  });

  it("／ が2つある式は null（ネスト分数はフォールバック）", () => {
    expect(splitFormulaFraction("Ｖｑ＝Ｑ（（Ｃ－Ｃｐ）／Ｃ）／Ｖ")).toBeNull();
  });

  it("等号がない式は null", () => {
    expect(splitFormulaFraction("Ａ_ｆ／（２５０√ｈ）")).toBeNull();
  });
});
