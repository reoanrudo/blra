export type TableColumnKind = "symbol" | "numeric" | "body";

export interface TableLayoutColumn {
  kind: TableColumnKind;
  widthPercent: number;
}

export interface TableLayout {
  columns: TableLayoutColumn[];
}

export interface TableLayoutInput {
  rows: string[][];
}

export interface TableLayoutCellInput {
  text: string;
  colspan: number;
  rowspan: number;
}

/**
 * 先頭行を thead に置くとき、縦結合セルを同じ行グループ内に保つための
 * 見出し行数を返す。rowspan は thead と tbody をまたげない。
 */
export function getTableHeaderRowCount(rows: TableLayoutCellInput[][]): number {
  const firstRow = rows[0] ?? [];
  const rowspan = Math.max(1, ...firstRow.map((cell) => Math.max(1, cell.rowspan)));
  return Math.min(rows.length, rowspan);
}

const LEGACY_TABLE_LAW_NAMES = new Set([
  "建築基準法",
  "建築基準法施行令",
  "建築基準法施行規則",
  "建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令",
]);

const TABLE_NODE_KEY_PATTERN = /(?:^|\/)(?:table|appdx_table):[^/]+$/;

export function usesLegacyLawTableLayout({
  lawName,
  stableNodeKey,
}: {
  lawName: string;
  stableNodeKey: string | null;
}): boolean {
  return (
    TABLE_NODE_KEY_PATTERN.test(stableNodeKey ?? "") &&
    LEGACY_TABLE_LAW_NAMES.has(lawName)
  );
}

const SYMBOL_PATTERN = /^[（(][^（）()]{1,8}[）)]$/;
const NUMERIC_PATTERN = /(?:\d|[０-９]|[一二三四五六七八九十百千万〇零]|\d+\/\d+|[%％㎡²]|平方メートル|立方メートル|時間)/;

/**
 * 表の各列を、記号・数値・本文に分けて本文幅内の配分比を返す。
 * 記号列と数値列を先に抑え、説明文へ残りの幅を渡すことで、個別表の
 * 固定幅に頼らず法令表の密度を安定させる。
 */
export function deriveTableLayout({ rows }: TableLayoutInput): TableLayout {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (columnCount === 0) return { columns: [] };

  const kinds = Array.from({ length: columnCount }, (_, columnIndex) =>
    classifyColumn(rows.map((row) => row[columnIndex] ?? "")),
  );
  const weights = kinds.map((kind, columnIndex) =>
    kind === "symbol"
      ? 1
      : kind === "numeric"
        ? 2
        : bodyWeight(rows, columnIndex),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return {
    columns: kinds.map((kind, index) => ({
      kind,
      widthPercent: (weights[index] / totalWeight) * 100,
    })),
  };
}

/**
 * HTML表の結合セルをグリッド列へ展開する。縦結合で占有された位置は空文字で
 * 保持し、後続行のセルが同じ列へずれ込まないようにする。
 */
export function expandTableRows(rows: TableLayoutCellInput[][]): string[][] {
  const grid: string[][] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = grid[rowIndex] ?? [];
    grid[rowIndex] = row;
    let columnIndex = 0;

    for (const cell of rows[rowIndex]) {
      while (row[columnIndex] !== undefined) columnIndex++;
      const colspan = Math.max(1, cell.colspan);
      const rowspan = Math.max(1, cell.rowspan);

      for (let columnOffset = 0; columnOffset < colspan; columnOffset++) {
        row[columnIndex + columnOffset] = cell.text;
        for (let rowOffset = 1; rowOffset < rowspan; rowOffset++) {
          const target = grid[rowIndex + rowOffset] ?? [];
          target[columnIndex + columnOffset] = "";
          grid[rowIndex + rowOffset] = target;
        }
      }
      columnIndex += colspan;
    }
  }

  const columnCount = Math.max(0, ...grid.map((row) => row.length));
  return grid.slice(0, rows.length).map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
}

function classifyColumn(values: string[]): TableColumnKind {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "symbol";

  if (nonEmpty.every((value) => SYMBOL_PATTERN.test(value))) {
    return "symbol";
  }

  const numericCount = nonEmpty.filter((value) => NUMERIC_PATTERN.test(value)).length;
  if (numericCount >= Math.ceil(nonEmpty.length / 2)) return "numeric";

  return nonEmpty.every((value) => value.length <= 4) ? "symbol" : "body";
}

function bodyWeight(rows: string[][], columnIndex: number): number {
  const longest = Math.max(
    0,
    ...rows.map((row) => (row[columnIndex] ?? "").trim().length),
  );
  return Math.min(16, Math.max(4, Math.sqrt(longest)));
}
