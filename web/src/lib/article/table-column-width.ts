interface PreferredLeadingColumnWidthInput {
  lawName: string;
  stableNodeKey: string | null;
  isMobile: boolean;
}

interface PreferredOrderSymbolColumnWidthInput {
  lawName: string;
  stableNodeKey: string | null;
  isSymbolColumn: boolean;
}

interface TableTextRow {
  cells: { text: string | null }[];
}

interface SupplementalRoomTypeTableCellLayoutInput {
  lawName: string;
  stableNodeKey: string | null;
  rows: TableTextRow[];
  rowIndex: number;
  cellIndex: number;
}

export interface SupplementalTableCellLayout {
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
  textAlign?: "center";
}

const BUILDING_CODE_ORDER_ARTICLE_19_ROOM_TYPE_TABLE =
  "root/chapter:2@2/section:1@1/article:19@1/paragraph:3@3/table_struct:1@1/table:1@1";

const TABLE_NODE_KEY_PATTERN = /(?:^|\/)(?:table|appdx_table):[^/]+$/;

function isBuildingCodeOrderArticle19RoomTypeTable(
  lawName: string,
  stableNodeKey: string | null,
): boolean {
  return (
    lawName === "建築基準法施行令" &&
    stableNodeKey === BUILDING_CODE_ORDER_ARTICLE_19_ROOM_TYPE_TABLE
  );
}

/**
 * 法令原文の構造上、汎用の文字数配分では広くなりすぎる先頭列について、
 * 表示に使用する固定幅を返す。
 */
export function preferredLeadingColumnWidthPx({
  lawName,
  stableNodeKey,
}: PreferredLeadingColumnWidthInput): number | null {
  if (isBuildingCodeOrderArticle19RoomTypeTable(lawName, stableNodeKey)) {
    return 35;
  }

  return null;
}

/** 対象表の割合列を、見出しと縦分数が収まる幅に固定する。 */
export function preferredTrailingColumnWidthPx({
  lawName,
  stableNodeKey,
}: PreferredLeadingColumnWidthInput): number | null {
  if (isBuildingCodeOrderArticle19RoomTypeTable(lawName, stableNodeKey)) {
    return 70;
  }

  return null;
}

/**
 * 施行令の「（1）」「（2）」等の欄記号だけを、全表で一定幅にする。
 * 説明文が短いだけの列や、建築基準法・施行規則の列幅には適用しない。
 */
export function preferredOrderSymbolColumnWidthPx({
  lawName,
  stableNodeKey,
  isSymbolColumn,
}: PreferredOrderSymbolColumnWidthInput): number | null {
  if (
    lawName === "建築基準法施行令" &&
    TABLE_NODE_KEY_PATTERN.test(stableNodeKey ?? "") &&
    isSymbolColumn
  ) {
    return 35;
  }

  return null;
}

/**
 * 第19条の居室種類表で欠落している見出しの横結合と割合の縦結合を補う。
 */
export function supplementalRoomTypeTableCellLayout({
  lawName,
  stableNodeKey,
  rows,
  rowIndex,
  cellIndex,
}: SupplementalRoomTypeTableCellLayoutInput): SupplementalTableCellLayout | null {
  if (!isBuildingCodeOrderArticle19RoomTypeTable(lawName, stableNodeKey)) {
    return null;
  }

  if (rowIndex === 0 && cellIndex === 0) {
    return { colSpan: 2, textAlign: "center" };
  }

  if (rowIndex === 0 || cellIndex !== 2) return null;

  const text = (rows[rowIndex]?.cells[cellIndex]?.text ?? "").trim();
  if (!text) return { hidden: true };

  let rowSpan = 1;
  for (let nextRow = rowIndex + 1; nextRow < rows.length; nextRow += 1) {
    const nextText = (rows[nextRow]?.cells[cellIndex]?.text ?? "").trim();
    if (nextText) break;
    rowSpan += 1;
  }

  return rowSpan > 1 ? { rowSpan } : null;
}
