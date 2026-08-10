import { describe, expect, it } from "vitest";
import { splitArithFormulaLayout } from "@/lib/article/arith-formula-layout";

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
});
