import type { ArticleRow } from "@/lib/article/article";

interface TableSpanMeta {
  colspan: number;
  rowspan: number;
}

function safeParseMeta(raw: string): TableSpanMeta | null {
  try {
    // raw が文字列の場合は JSON.parse、オブジェクトの場合はそのまま
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      colspan: typeof parsed.colspan === "number" ? parsed.colspan : 1,
      rowspan: typeof parsed.rowspan === "number" ? parsed.rowspan : 1,
    };
  } catch {
    return null;
  }
}

export type RenderSegment =
  | { type: "node"; row: ArticleRow }
  | { type: "anchor"; row: ArticleRow }
  | {
      type: "definition";
      row: ArticleRow;
      keyword: string;
      body: string;
      anchorRows: ArticleRow[];
    }
  | {
      type: "table";
      table: ArticleRow;
      rows: { row: ArticleRow; cells: ArticleRow[] }[];
      anchorRows: ArticleRow[];
    };

export function buildSegments(children: ArticleRow[]): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let index = 0;

  while (index < children.length) {
    const row = children[index];

    if (row.level === "table_struct") {
      segments.push({ type: "anchor", row });
      index += 1;
      continue;
    }

    if (row.level === "table") {
      const tableDepth = row.depth;
      const tableDescendants: ArticleRow[] = [];
      index += 1;
      while (
        index < children.length &&
        children[index].depth > tableDepth
      ) {
        tableDescendants.push(children[index]);
        index += 1;
      }

      const byParent = new Map<string, ArticleRow[]>();
      for (const descendant of tableDescendants) {
        if (!descendant.parentId) continue;
        const siblings = byParent.get(descendant.parentId);
        if (siblings) siblings.push(descendant);
        else byParent.set(descendant.parentId, [descendant]);
      }
      byParent.forEach((siblings) => {
        siblings.sort((left, right) => left.sortOrder - right.sortOrder);
      });

      const tableRows = (byParent.get(row.id) ?? []).filter(
        (candidate) => candidate.level === "table_row",
      );
      // rowspan/colspanを考慮して仮想グリッドを構築し、
      // 各セルの正しい列位置を計算する。
      // HTMLの<table>にそのまま渡すと、rowspanで欠落した列に
      // セルが左詰めで誤配置されるため、プレースホルダーで補完する。
      const grid: (ArticleRow | null)[][] = [];
      const occupied: Set<string>[] = []; // [row][col] = occupied
      const structuredRows = tableRows.map((tableRow, rowIdx) => {
        const rawCells = (byParent.get(tableRow.id) ?? []).filter(
          (candidate) => candidate.level === "table_column",
        );
        // グリッド行を確保
        while (grid.length <= rowIdx) {
          grid.push([]);
          occupied.push(new Set());
        }
        const placedCells: (ArticleRow | null)[] = [];
        let colIdx = 0;
        for (const cell of rawCells) {
          // rowspanで占有されている列をスキップ
          while (occupied[rowIdx]?.has(String(colIdx))) colIdx++;
          const meta = cell.tableMetadata ? safeParseMeta(cell.tableMetadata) : null;
          const rs = meta?.rowspan ?? 1;
          const cs = meta?.colspan ?? 1;
          // グリッドを拡張
          while (grid[rowIdx].length < colIdx + cs) {
            grid[rowIdx].push(null);
            occupied[rowIdx].add(String(grid[rowIdx].length - 1));
          }
          // セルを配置
          placedCells[colIdx] = cell;
          // rowspan分の占有を記録
          for (let r = 0; r < rs; r++) {
            for (let c = 0; c < cs; c++) {
              const rr = rowIdx + r;
              while (occupied.length <= rr) { grid.push([]); occupied.push(new Set()); }
              occupied[rr].add(String(colIdx + c));
            }
          }
          colIdx += cs;
        }
        // placedCellsのnullを詰めずにそのまま返す（HTMLがcolSpan/rowSpanで処理する）
        // ただしnullの位置にはダミーセルは不要（rowspanで覆われているため）
        return {
          row: tableRow,
          cells: placedCells.filter((c): c is ArticleRow => c !== null),
        };
      });
      const visibleIds = new Set(
        structuredRows.flatMap((structured) => [
          structured.row.id,
          ...structured.cells.map((cell) => cell.id),
        ]),
      );

      segments.push({
        type: "table",
        table: row,
        rows: structuredRows,
        anchorRows: tableDescendants.filter(
          (descendant) => !visibleIds.has(descendant.id),
        ),
      });
      continue;
    }

    if (
      row.level === "table_row" ||
      row.level === "table_column" ||
      row.level === "column"
    ) {
      segments.push({ type: "anchor", row });
      index += 1;
      continue;
    }

    if (row.level === "item") {
      let columnIndex = index + 1;
      let keyword: string | null = null;
      let body: string | null = null;
      const columns: ArticleRow[] = [];
      while (
        columnIndex < children.length &&
        children[columnIndex].level === "column" &&
        children[columnIndex].parentId === row.id
      ) {
        const column = children[columnIndex];
        columns.push(column);
        if (column.articleNumber === "1") keyword = column.text?.trim() ?? null;
        if (column.articleNumber === "2") body = column.text?.trim() ?? null;
        columnIndex += 1;
      }
      if (keyword && body) {
        segments.push({
          type: "definition",
          row,
          keyword,
          body,
          anchorRows: columns,
        });
        index = columnIndex;
        continue;
      }
    }

    segments.push({ type: "node", row });
    index += 1;
  }

  return segments;
}
