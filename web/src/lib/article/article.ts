import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
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

/** Fetch article with full descendant tree via recursive CTE (single query, no N+1) */
export async function getArticleWithTree(articleId: string): Promise<ArticleRow[]> {
  const lawBookScope = lawBookArticleScopeSql("a", "e");
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    WITH RECURSIVE article_tree AS (
      SELECT a.*, l.name AS "lawName", 0 AS depth,
             ARRAY[a."sortOrder"] AS path
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      JOIN "LawBookEntry" e
        ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
      JOIN "LawBookEdition" edition ON edition.id = e."editionId"
      WHERE a.id = $1
        AND a."deletedAt" IS NULL
        AND edition."editionKey" = $2
        AND ${lawBookScope}

      UNION ALL

      SELECT a.*, at."lawName", at.depth + 1,
             at.path || a."sortOrder"
      FROM "Article" a
      INNER JOIN article_tree at ON a."parentId" = at.id
      WHERE a."deletedAt" IS NULL
    )
    SELECT * FROM article_tree ORDER BY path
    `,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows;
}

/** Fetch ancestor chain for breadcrumbs (root-to-leaf order) */
export async function getArticleBreadcrumb(articleId: string): Promise<ArticleRow[]> {
  const lawBookScope = lawBookArticleScopeSql("a", "e");
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    WITH RECURSIVE ancestor_chain AS (
      SELECT a.*, l.name AS "lawName", 0 AS depth
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      JOIN "LawBookEntry" e
        ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
      JOIN "LawBookEdition" edition ON edition.id = e."editionId"
      WHERE a.id = $1
        AND a."deletedAt" IS NULL
        AND edition."editionKey" = $2
        AND ${lawBookScope}

      UNION ALL

      SELECT a.*, ac."lawName", ac.depth + 1
      FROM "Article" a
      INNER JOIN ancestor_chain ac ON a.id = ac."parentId"
      WHERE a."deletedAt" IS NULL
    )
    SELECT * FROM ancestor_chain ORDER BY depth DESC
    `,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows;
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

/**
 * Fetch all articles within the same chapter/section as the given article,
 * including their full descendant trees.
 *
 * Step 1: Walk UP to find scope ancestor (chapter/section/subsection).
 * Step 2: Walk DOWN from scope ancestor to get ALL descendants.
 * Grouped by top-level article in JS.
 */
export async function getChapterArticlesWithTrees(
  articleId: string,
): Promise<{
  articles: ChapterArticle[];
  scopeAncestor: ArticleRow | null;
}> {
  const articleScope = lawBookArticleScopeSql("a", "e");
  // Step 1: Find scope ancestor by walking up.
  // ADR-024: 章スクロールのスコープは chapter を最優先。
  // 子→親へ遡る再帰CTEで全祖先を集め、CASE で優先順（chapter > section > subsection）を与えて最初の1件を採用する。
  // 旧実装では LIMIT 1 により節が先にマッチし、建基令で「章をまたげない」状態になっていた。
  const ancestors = await prisma.$queryRawUnsafe<Array<{ id: string; level: string }>>(
    `
    WITH RECURSIVE up AS (
      SELECT a.id, a."parentId", a.level
      FROM "Article" a
      JOIN "LawBookEntry" e
        ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
      JOIN "LawBookEdition" edition ON edition.id = e."editionId"
      WHERE a.id = $1
        AND a."deletedAt" IS NULL
        AND edition."editionKey" = $2
        AND ${articleScope}
      UNION ALL
      SELECT a.id, a."parentId", a.level
      FROM "Article" a
      INNER JOIN up ON a.id = up."parentId"
      WHERE a."deletedAt" IS NULL
    )
    SELECT id, level FROM up
    WHERE level IN ('chapter', 'section', 'subsection')
    ORDER BY CASE level
      WHEN 'chapter' THEN 0
      WHEN 'section' THEN 1
      WHEN 'subsection' THEN 2
      ELSE 3
    END
    LIMIT 1
    `,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  // If no chapter/section ancestor, use the law root
  let scopeId: string;
  let scopeAncestor: ArticleRow | null = null;

  if (ancestors.length > 0) {
    scopeId = ancestors[0]!.id;
  } else {
    // Fallback: walk up to parentId IS NULL (law-level root)
    const rootRow = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
      WITH RECURSIVE up AS (
        SELECT a.id, a."parentId"
        FROM "Article" a
        JOIN "LawBookEntry" e
          ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
        JOIN "LawBookEdition" edition ON edition.id = e."editionId"
        WHERE a.id = $1
          AND a."deletedAt" IS NULL
          AND edition."editionKey" = $2
          AND ${articleScope}
        UNION ALL
        SELECT a.id, a."parentId"
        FROM "Article" a
        INNER JOIN up ON a.id = up."parentId"
        WHERE a."deletedAt" IS NULL
      )
      SELECT id FROM up WHERE "parentId" IS NULL LIMIT 1
      `,
      articleId,
      CURRENT_LAW_BOOK_EDITION_KEY,
    );
    scopeId = rootRow[0]?.id ?? articleId;
  }

  // Step 2: Fetch scope ancestor row for display
  const scopeRows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    SELECT a.*, l.name AS "lawName", 0 AS depth
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    WHERE a.id = $1 AND a."deletedAt" IS NULL
    `,
    scopeId,
  );
  scopeAncestor = scopeRows[0] ?? null;

  // Step 3: Fetch all descendants of scope ancestor
  const treeScope = lawBookArticleScopeSql("tree", "e");
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    WITH RECURSIVE tree AS (
      SELECT a.*, l.name AS "lawName", 0 AS depth,
             ARRAY[a."sortOrder"] AS path
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      WHERE a."parentId" = $1 AND a."deletedAt" IS NULL

      UNION ALL

      SELECT a.*, tree."lawName", tree.depth + 1,
             tree.path || a."sortOrder"
      FROM "Article" a
      INNER JOIN tree ON a."parentId" = tree.id
      WHERE a."deletedAt" IS NULL
    )
    SELECT tree.*
    FROM tree
    JOIN "LawBookEntry" e
      ON e."lawId" = tree."lawId" AND e."lawRevisionId" = tree."lawRevisionId"
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE edition."editionKey" = $2
      AND ${treeScope}
    ORDER BY path
    `,
    scopeId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  // Group into ChapterArticle entries.
  // ADR-024: 条（article）を root とし、その配下（paragraph/item/subitem/column 等）を children とする。
  // 旧実装（scope直下の子=root）では、建基令のように「章 → 節 → 条」の階層を持つ法令で
  // 「節」が root になり、条が正しくグルーピングされなかった。
  // 行レコードは再帰CTEで path 順（文書順）に並んでいるため、article を見るたびに新規 root、
  // それ以外は現在の root の children に追加する。
  const articles: ChapterArticle[] = [];
  let currentRoot: ArticleRow | null = null;
  let currentChildren: ArticleRow[] = [];

  for (const row of rows) {
    if (row.level === "article") {
      // article = new root
      if (currentRoot) {
        articles.push({ root: currentRoot, children: currentChildren });
      }
      currentRoot = row;
      currentChildren = [];
    } else if (currentRoot) {
      currentChildren.push(row);
    }
  }

  if (currentRoot) {
    articles.push({ root: currentRoot, children: currentChildren });
  }

  return { articles, scopeAncestor };
}
