import type { ArticleLevel } from "@prisma/client";

export interface ParseLawContext {
  lawId: string;
  egovLawId: string;
  revisionId: string;
  /**
   * 既存DBのセル情報を復元する読み取り専用処理でのみ使用する。
   * 原典XMLにある重複見出しをoccurrenceで区別し、全セルを走査する。
   */
  tolerateDuplicateDurableKeys?: boolean;
}

/**
 * e-Gov XML の TableColumn 要素のセルスタイル（罫線・結合）。
 * 罫線は4辺それぞれ solid/none で個別制御される。
 * colspan/rowspan は省略時 1。
 */
export interface TableCellStyle {
  borderTop: "solid" | "none";
  borderRight: "solid" | "none";
  borderBottom: "solid" | "none";
  borderLeft: "solid" | "none";
  colspan: number;
  rowspan: number;
}

export interface ParsedLawNode {
  sourceIndex: number;
  parentSourceIndex: number | null;
  level: ArticleLevel;
  legacyStableNodeKey: string;
  durableNodeKey: string;
  contentChecksum: string;
  bodyChecksum: string;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  paragraphNumber: string | null;
  itemNumber: string | null;
  subitemNumber: string | null;
  title: string | null;
  caption: string | null;
  text: string | null;
  sortOrder: number;
  systemTags: Record<string, unknown> | null;
  /** table_column レベルのとき、罫線・結合属性の抽出結果（それ以外は null） */
  tableCellMeta: TableCellStyle | null;
}

export interface ParsedLawDocument {
  lawId: string;
  egovLawId: string;
  revisionId: string;
  nodes: ParsedLawNode[];
}

export interface ArticleRow {
  id: string;
  lawId: string;
  parentId: string | null;
  level: ArticleLevel;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  paragraphNumber: string | null;
  itemNumber: string | null;
  subitemNumber: string | null;
  columnNumber: string | null;
  tableCoords: string | null;
  title: string | null;
  caption: string | null;
  text: string | null;
  articleCaptionNormalized: string | null;
  sortOrder: number;
  regulationType: string | null;
  systemTags: Record<string, unknown> | null;
  lawRevisionId: string;
  stableNodeKey: string;
  durableNodeKey: string;
  contentChecksum: string;
  bodyChecksum: string;
  /** table_column レベルのとき TableCellStyle の JSON 文字列、それ以外は null */
  tableMetadata: string | null;
}
