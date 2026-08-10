import type { TableCellStyle } from "./types";

export interface StoredTableCellForBackfill {
  id: string;
  /** 法令内でのTable要素の出現順（1始まり） */
  tableOrder: number;
  text: string | null;
  tableMetadata: unknown | null;
}

export interface SourceTableCellForBackfill {
  /** 法令内でのTable要素の出現順（1始まり） */
  tableOrder: number;
  text: string | null;
  tableCellMeta: TableCellStyle;
}

export interface TableMetadataBackfillPlan {
  updates: Array<{ id: string; tableMetadata: TableCellStyle }>;
  /** XMLとDBでセル数が異なり、安全に対応付けられなかったTableの出現順 */
  skippedTableOrders: number[];
}

/**
 * 同一法令のDBセルと元XMLセルを、Tableごとの出現順で安全に対応付ける。
 *
 * 対象データは同じ法令版から取得しているため、表単位でセル数が一致するときのみ
 * 同じ順序のセルへ罫線・結合情報を反映する。セル数が異なる表は一切更新しない。
 */
export function planTableMetadataBackfill(
  storedCells: StoredTableCellForBackfill[],
  sourceCells: SourceTableCellForBackfill[],
): TableMetadataBackfillPlan {
  const storedByTable = groupByTableOrder(storedCells);
  const sourceByTable = groupByTableOrder(sourceCells);
  const tableOrders = new Set([
    ...storedByTable.keys(),
    ...sourceByTable.keys(),
  ]);
  const updates: TableMetadataBackfillPlan["updates"] = [];
  const skippedTableOrders: number[] = [];

  for (const tableOrder of [...tableOrders].sort((a, b) => a - b)) {
    const stored = storedByTable.get(tableOrder) ?? [];
    const source = sourceByTable.get(tableOrder) ?? [];
    if (stored.length !== source.length) {
      skippedTableOrders.push(tableOrder);
      continue;
    }

    for (let index = 0; index < stored.length; index++) {
      const storedCell = stored[index];
      const sourceCell = source[index];
      if (storedCell.tableMetadata !== null) continue;
      updates.push({
        id: storedCell.id,
        tableMetadata: sourceCell.tableCellMeta,
      });
    }
  }

  return { updates, skippedTableOrders };
}

function groupByTableOrder<T extends { tableOrder: number }>(
  cells: T[],
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const cell of cells) {
    const group = groups.get(cell.tableOrder) ?? [];
    group.push(cell);
    groups.set(cell.tableOrder, group);
  }
  return groups;
}
