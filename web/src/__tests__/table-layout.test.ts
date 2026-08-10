import { describe, expect, it } from "vitest";
import {
  deriveTableLayout,
  expandTableRows,
  usesLegacyLawTableLayout,
} from "@/lib/article/table-layout";

describe("deriveTableLayout", () => {
  it("番号・本文・割合の表では本文列を最も広く配分する", () => {
    const layout = deriveTableLayout({
      rows: [
        ["(1)", "居室の種類", "割合"],
        ["(2)", "幼稚園、小学校、中学校その他の教室", "1/5"],
      ],
    });

    expect(layout.columns.map((column) => column.kind)).toEqual([
      "symbol",
      "body",
      "numeric",
    ]);
    expect(layout.columns[1].widthPercent).toBeGreaterThan(
      layout.columns[0].widthPercent,
    );
    expect(layout.columns[1].widthPercent).toBeGreaterThan(
      layout.columns[2].widthPercent,
    );
  });

  it("すべての列へ正の幅を配分し、合計を100%にする", () => {
    const layout = deriveTableLayout({
      rows: [["用途", "構造の説明", "数値", "備考"]],
    });

    expect(layout.columns.every((column) => column.widthPercent > 0)).toBe(true);
    expect(
      layout.columns.reduce((sum, column) => sum + column.widthPercent, 0),
    ).toBeCloseTo(100, 5);
  });

  it("横結合と縦結合を実際のグリッド列へ展開する", () => {
    expect(
      expandTableRows([
        [
          { text: "区分", colspan: 2, rowspan: 1 },
          { text: "数値", colspan: 1, rowspan: 2 },
        ],
        [
          { text: "本文", colspan: 1, rowspan: 1 },
          { text: "備考", colspan: 1, rowspan: 1 },
        ],
      ]),
    ).toEqual([
      ["区分", "区分", "数値"],
      ["本文", "備考", ""],
    ]);
  });
});

describe("usesLegacyLawTableLayout", () => {
  it.each([
    ["建築基準法", "root/appdx_table:128@128", true],
    ["建築基準法施行令", "root/article:19@1/table:1@1", true],
    ["建築基準法施行規則", "root/appdx_table:1@1", true],
    ["消防法施行令", "root/appdx_table:1@1", false],
  ])("%s の表は旧レイアウトか", (lawName, stableNodeKey, expected) => {
    expect(usesLegacyLawTableLayout({ lawName, stableNodeKey })).toBe(expected);
  });
});
