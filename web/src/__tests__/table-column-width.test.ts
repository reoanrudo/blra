import { describe, expect, it } from "vitest";
import {
  preferredLeadingColumnWidthPx,
  preferredTrailingColumnWidthPx,
  supplementalRoomTypeTableCellLayout,
} from "@/lib/article/table-column-width";

const TARGET_TABLE_KEY =
  "root/chapter:2@2/section:1@1/article:19@1/paragraph:3@3/table_struct:1@1/table:1@1";

const targetTable = {
  lawName: "建築基準法施行令",
  stableNodeKey: TARGET_TABLE_KEY,
};

const rows = [
  { cells: [{ text: "居室の種類" }, { text: "割合" }] },
  { cells: [{ text: "(1)" }, { text: "幼稚園等の教室" }, { text: "五分の一" }] },
  { cells: [{ text: "(2)" }, { text: "前項第一号に掲げる居室" }, { text: null }] },
  { cells: [{ text: "(3)" }, { text: "住宅の居室" }, { text: "七分の一" }] },
  { cells: [{ text: "(4)" }, { text: "病院の病室" }, { text: null }] },
  { cells: [{ text: "(5)" }, { text: "寄宿舎の寝室" }, { text: null }] },
  { cells: [{ text: "(6)" }, { text: "前項第三号等の居室" }, { text: null }] },
  { cells: [{ text: "(7)" }, { text: "その他の学校の教室" }, { text: "十分の一" }] },
  { cells: [{ text: "(8)" }, { text: "前項第五号に掲げる居室" }, { text: null }] },
];

describe("建築基準法施行令第19条の居室種類表", () => {
  it("番号列をPCとモバイルの両方で35pxにする", () => {
    expect(
      preferredLeadingColumnWidthPx({
        ...targetTable,
        isMobile: false,
      }),
    ).toBe(35);
    expect(
      preferredLeadingColumnWidthPx({
        ...targetTable,
        isMobile: true,
      }),
    ).toBe(35);
  });

  it("割合列を分数が収まる70pxにする", () => {
    expect(
      preferredTrailingColumnWidthPx({
        ...targetTable,
        isMobile: false,
      }),
    ).toBe(70);
  });

  it("居室の種類の見出しを番号列と説明列にまたがらせる", () => {
    expect(
      supplementalRoomTypeTableCellLayout({
        ...targetTable,
        rows,
        rowIndex: 0,
        cellIndex: 0,
      }),
    ).toEqual({ colSpan: 2, textAlign: "center" });
  });

  it("割合の値を空白行と2・4・2行で縦結合する", () => {
    expect(
      rows.slice(1).map((_, index) =>
        supplementalRoomTypeTableCellLayout({
          ...targetTable,
          rows,
          rowIndex: index + 1,
          cellIndex: 2,
        }),
      ),
    ).toEqual([
      { rowSpan: 2 },
      { hidden: true },
      { rowSpan: 4 },
      { hidden: true },
      { hidden: true },
      { hidden: true },
      { rowSpan: 2 },
      { hidden: true },
    ]);
  });

  it("同じ法令の別表には固定幅を適用しない", () => {
    expect(
      preferredLeadingColumnWidthPx({
        lawName: "建築基準法施行令",
        stableNodeKey:
          "root/chapter:5@5/section:2@2/article:120@4/paragraph:1@1/table_struct:1@1/table:1@1",
        isMobile: false,
      }),
    ).toBeNull();
    expect(
      supplementalRoomTypeTableCellLayout({
        lawName: "建築基準法施行令",
        stableNodeKey:
          "root/chapter:5@5/section:2@2/article:120@4/paragraph:1@1/table_struct:1@1/table:1@1",
        rows,
        rowIndex: 0,
        cellIndex: 0,
      }),
    ).toBeNull();
    expect(
      preferredTrailingColumnWidthPx({
        lawName: "建築基準法施行令",
        stableNodeKey:
          "root/chapter:5@5/section:2@2/article:120@4/paragraph:1@1/table_struct:1@1/table:1@1",
        isMobile: false,
      }),
    ).toBeNull();
  });
});
