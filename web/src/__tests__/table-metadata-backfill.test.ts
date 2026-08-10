import { describe, expect, it } from "vitest";
import { planTableMetadataBackfill } from "@/lib/law-refresh/table-metadata-backfill";

const style = {
  borderTop: "solid" as const,
  borderRight: "solid" as const,
  borderBottom: "solid" as const,
  borderLeft: "solid" as const,
  colspan: 1,
  rowspan: 1,
};

describe("planTableMetadataBackfill", () => {
  it("同じ並び・同じセル数の表を順序で対応付ける", () => {
    const result = planTableMetadataBackfill(
      [
        { id: "db-1", tableOrder: 1, text: "見出し", tableMetadata: null },
        { id: "db-2", tableOrder: 1, text: "本文", tableMetadata: null },
        { id: "db-3", tableOrder: 2, text: "別表", tableMetadata: null },
      ],
      [
        { tableOrder: 1, text: "見出し", tableCellMeta: { ...style, colspan: 2 } },
        { tableOrder: 1, text: "本文", tableCellMeta: style },
        { tableOrder: 2, text: "別表", tableCellMeta: { ...style, rowspan: 2 } },
      ],
    );

    expect(result.skippedTableOrders).toEqual([]);
    expect(result.updates).toEqual([
      { id: "db-1", tableMetadata: { ...style, colspan: 2 } },
      { id: "db-2", tableMetadata: style },
      { id: "db-3", tableMetadata: { ...style, rowspan: 2 } },
    ]);
  });

  it("セル数の異なる表は対応付けず除外する", () => {
    const result = planTableMetadataBackfill(
      [
        { id: "db-1", tableOrder: 1, text: "甲", tableMetadata: null },
        { id: "db-2", tableOrder: 1, text: "乙", tableMetadata: null },
      ],
      [
        { tableOrder: 1, text: "甲", tableCellMeta: style },
      ],
    );

    expect(result.updates).toEqual([]);
    expect(result.skippedTableOrders).toEqual([1]);
  });

  it("既にセル情報があるセルは更新対象にしない", () => {
    const result = planTableMetadataBackfill(
      [{ id: "db-1", tableOrder: 1, text: "甲", tableMetadata: style }],
      [{ tableOrder: 1, text: "甲", tableCellMeta: { ...style, colspan: 2 } }],
    );

    expect(result.updates).toEqual([]);
    expect(result.skippedTableOrders).toEqual([]);
  });
});
