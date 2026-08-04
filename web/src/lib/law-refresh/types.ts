import type { ArticleLevel } from "@prisma/client";

export interface ParseLawContext {
  lawId: string;
  egovLawId: string;
  revisionId: string;
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
}
