import type { ArticleRow } from "@/lib/article/article";

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
      const structuredRows = tableRows.map((tableRow) => ({
        row: tableRow,
        cells: (byParent.get(tableRow.id) ?? []).filter(
          (candidate) => candidate.level === "table_column",
        ),
      }));
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
