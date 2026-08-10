import { describe, expect, it } from "vitest";
import { preferredOrderSymbolColumnWidthPx } from "@/lib/article/table-column-width";

const ORDER_TABLE_KEY =
  "root/chapter:4@4/section:2@2/article:82@1/paragraph:1@1/table_struct:1@1/table:1@1";

describe("建築基準法施行令の欄記号列", () => {
  it("（1）（2）のような欄記号列だけを35pxにする", () => {
    expect(preferredOrderSymbolColumnWidthPx({
      lawName: "建築基準法施行令",
      stableNodeKey: ORDER_TABLE_KEY,
      isSymbolColumn: true,
    })).toBe(35);
    expect(preferredOrderSymbolColumnWidthPx({
      lawName: "建築基準法施行令",
      stableNodeKey: ORDER_TABLE_KEY,
      isSymbolColumn: false,
    })).toBeNull();
  });

  it("施行規則と建築基準法の別表には適用しない", () => {
    for (const lawName of ["建築基準法", "建築基準法施行規則"]) {
      expect(preferredOrderSymbolColumnWidthPx({
        lawName,
        stableNodeKey: ORDER_TABLE_KEY,
        isSymbolColumn: true,
      })).toBeNull();
    }
  });
});
