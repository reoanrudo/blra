/**
 * 条文表示用の純粋関数・型定義。
 *
 * 元は hourei-rag から移植した Prisma データ取得関数を含んでいたが、
 * blra は API（api/client.ts）経由でデータを取得するため、
 * このファイルには表示用の純粋関数と型のみ残す。
 * データ取得は ReaderPage が useProvisions フックで行う。
 */

import { formatStructuredNumber } from "@/lib/article/legal-number-format";

export interface ArticleRow {
  id: string;
  parentId: string | null;
  level: string;
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
  depth: number;
  lawId: string;
  lawName: string;
  regulationType: string | null;
  /** 文書構造内で安定した識別子（改正で変わらない階層パス）。`a.*` 取得に含まれる */
  stableNodeKey: string | null;
  /** Articleが属するLawRevisionのID */
  lawRevisionId: string;
}

/** Look up the display label for an article level row.
 *  構造化番号を算用数字化して返す（設計書§4.1）。DB値は変更しない。 */
export function articleLabel(row: ArticleRow): string {
  switch (row.level) {
    case "article":
      return `第${formatStructuredNumber(row.articleNumber)}条`;
    case "paragraph":
      return row.paragraphNumber ?? "";
    case "item":
      // 号番号は法令の号構造のため原文のまま（設計書§4.3）
      return row.itemNumber || row.articleNumber || "";
    case "subitem1":
    case "subitem2":
    case "subitem3":
      // 号の枝番は号構造の一部のため原文のまま（設計書§4.3）
      return row.subitemNumber ?? "";
    case "column":
      return row.columnNumber ? `Column ${row.columnNumber}` : "";
    case "appdx_table":
      return `別表第${formatStructuredNumber(row.articleNumber)}`;
    case "suppl_provision":
      return row.title ?? "附則";
    case "table_struct":
    case "table":
      return row.title ?? "";
    default:
      return "";
  }
}

/** 利用者に表示する条文見出し。内部のlevel値は画面へ露出しない。
 *  構造化番号を算用数字化する（設計書§4.1）。 */
export function articleDisplayTitle(row: ArticleRow): string {
  if (row.level === "paragraph") {
    const num = row.paragraphNumber ? formatStructuredNumber(row.paragraphNumber) : "1";
    return `第${num}項`;
  }

  if (row.level === "item") {
    const item = articleLabel(row);
    return item ? `${item}号` : "号";
  }

  if (["subitem1", "subitem2", "subitem3"].includes(row.level)) {
    const subitem = articleLabel(row);
    return subitem ? `枝番 ${subitem}` : "枝番";
  }

  const title = row.title ?? row.caption ?? (articleLabel(row) || "条文");
  // 章・節・款タイトル内の番号を算用数字化（例: 「第二章　総則」→「第2章　総則」）
  return formatTitleNumber(title);
}

/**
 * タイトル文字列内の「第N章」「第N節」「第N款」等の構造化番号を算用数字化する。
 * タイトル本体の漢数字（意味を持つ固有名詞等）は変換しない。
 * 例: 「第二章の二　指定構造計算適合判定資格者検定機関」→「第2章の2　指定構造計算適合判定資格者検定機関」
 */
export function formatTitleNumber(title: string): string {
  // 「第<漢数字>(章|節|款|編|部)」の後に「の<漢数字>」が続く場合も含めて変換
  // 例: 「第二章の二」→「第2章の2」、「第三章」→「第3章」
  return title.replace(
    /第([一二三四五六七八九十百]+)((?:章|節|款|編|部))(の[一二三四五六七八九十百]+)?/g,
    (_match, numPart: string, unit: string, suffix: string | undefined) => {
      const formattedNum = formatStructuredNumber(numPart);
      const formattedSuffix = suffix
        ? formatStructuredNumber(suffix)
        : "";
      return `第${formattedNum}${unit}${formattedSuffix}`;
    },
  );
}

/** 直URLで子ノードを開いたときも、条または附則の文脈を含めた見出しを返す。 */
export function articleContextTitle(breadcrumb: ArticleRow[]): string {
  if (breadcrumb.length === 0) return "条文";

  const contextRoots = new Set(["article", "suppl_provision", "appdx_table"]);
  let startIndex = 0;
  for (let index = 0; index < breadcrumb.length; index += 1) {
    if (contextRoots.has(breadcrumb[index].level)) startIndex = index;
  }

  const title = breadcrumb
    .slice(startIndex)
    .map(articleDisplayTitle)
    .filter(Boolean)
    .join(" ");

  return title || "条文";
}

/** Levels that are rendered as structural headings */
const headingLevels = new Set(["chapter", "section", "subsection", "appdx_table", "suppl_provision"]);

export function isHeadingLevel(level: string): boolean {
  return headingLevels.has(level);
}

/** A top-level node (article or structural heading) with its descendant tree */
export interface ChapterArticle {
  root: ArticleRow;
  children: ArticleRow[];
}
