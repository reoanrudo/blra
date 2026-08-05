import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { currentLawBookArticleScopeSql } from "@/lib/law-book/current-scope";
import {
  articleDisplayTitle,
  type ArticleRow,
  type ChapterArticle,
} from "@/lib/article/article";

export interface ScrollScopeInfo {
  id: string;
  stableNodeKey: string;
  title: string | null;
  label: string;
  level: string;
  firstCursor: "1";
}

function toScrollScopeInfo(row: ArticleRow): ScrollScopeInfo {
  return {
    id: row.id,
    stableNodeKey: row.stableNodeKey ?? row.id,
    title: row.title,
    label: articleDisplayTitle(row),
    level: row.level,
    firstCursor: "1",
  };
}

/**
 * 章スクロール段階読込の中核（設計書 §3.2, §4.3）
 *
 * - 初期ウィンドウ: 対象Articleを中心に前後各 N 件（既定5、最大11）。
 * - before/after ページング: cursor位置から M 件（既定10）ずつ追加取得。
 * - 1回の取得はscope境界（chapter > section > subsection > law root）を越えない。
 *   同一法令内の次scopeはnextScopeとして別途返す。
 * - Article ルート単位で取得し、各ルートの全子孫を含む。
 * - LawBookEntryスコープ・soft delete・`deletedAt IS NULL` を含める。
 *
 * 実装方針: getChapterArticlesWithTrees と同じ「章解決→全子孫取得→JS側グループ化」
 * アプローチを再利用し、そこからウィンドウを切り出す。
 * 附則（suppl_provision）も article と同様にルートとして扱う。
 */

/** 章(スコープ)解決の内部関数。ADR-024: chapter > section > subsection > law root の優先順 */
async function resolveChapterScopeId(articleId: string): Promise<{
  scopeId: string;
  scopeRow: ArticleRow | null;
}> {
  const articleScope = currentLawBookArticleScopeSql("a", "e", "l");
  const ancestors = await prisma.$queryRawUnsafe<Array<{ id: string; level: string }>>(
    `
    WITH RECURSIVE up AS (
      SELECT a.id, a."parentId", a.level, a."lawRevisionId"
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      JOIN "LawBookEntry" e
        ON e."lawId" = l.id
       AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
      JOIN "LawBookEdition" edition ON edition.id = e."editionId"
      WHERE a.id = $1
        AND edition."editionKey" = $2
        AND ${articleScope}
      UNION ALL
      SELECT a.id, a."parentId", a.level, a."lawRevisionId"
      FROM "Article" a
      INNER JOIN up ON a.id = up."parentId"
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = up."lawRevisionId"
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

  if (ancestors.length > 0) {
    const scopeId = ancestors[0]!.id;
    const scopeRows = await prisma.$queryRawUnsafe<ArticleRow[]>(
      `
      SELECT a.*, l.name AS "lawName", 0 AS depth
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      WHERE a.id = $1 AND a."deletedAt" IS NULL
      `,
      scopeId,
    );
    return { scopeId, scopeRow: scopeRows[0] ?? null };
  }

  // Fallback: law-level root
  const rootRow = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    WITH RECURSIVE up AS (
      SELECT a.id, a."parentId", a."lawRevisionId"
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      JOIN "LawBookEntry" e
        ON e."lawId" = l.id
       AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
      JOIN "LawBookEdition" edition ON edition.id = e."editionId"
      WHERE a.id = $1
        AND edition."editionKey" = $2
        AND ${articleScope}
      UNION ALL
      SELECT a.id, a."parentId", a."lawRevisionId"
      FROM "Article" a
      INNER JOIN up ON a.id = up."parentId"
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = up."lawRevisionId"
    )
    SELECT id FROM up WHERE "parentId" IS NULL LIMIT 1
    `,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  const fallbackScopeId = rootRow[0]?.id ?? articleId;
  // フォールバックルートの行情報を取得（附則等のルートレベル判定のため）
  const fallbackScopeRows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    SELECT a.*, l.name AS "lawName", 0 AS depth
    FROM "Article" a
    JOIN "Law" l ON a."lawId" = l.id
    WHERE a.id = $1 AND a."deletedAt" IS NULL
    `,
    fallbackScopeId,
  );
  return { scopeId: fallbackScopeId, scopeRow: fallbackScopeRows[0] ?? null };
}

/**
 * 同じ法令・Revision・法令集収録範囲で、現在scopeの直後にある公開scopeを返す。
 * 文書ツリー上の次の公開Articleを先に求め、そのArticleへ既存scope解決規則を適用する。
 */
export async function getNextScrollScope(
  scopeId: string,
): Promise<ScrollScopeInfo | null> {
  const currentRows = await prisma.$queryRawUnsafe<
    Array<{ lawId: string; lawRevisionId: string }>
  >(
    `SELECT a."lawId", a."lawRevisionId"
     FROM "Article" a
     JOIN "Law" l ON l.id = a."lawId"
     WHERE a.id = $1 AND a."deletedAt" IS NULL
       AND l."currentRevisionId" = a."lawRevisionId"
     LIMIT 1`,
    scopeId,
  );
  const current = currentRows[0];
  if (!current) return null;

  const treeScope = currentLawBookArticleScopeSql("tree", "e", "tree_law");
  const nextRoots = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `WITH RECURSIVE document_tree AS (
       SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId",
              a."stableNodeKey", a."durableNodeKey", a."deletedAt",
              ARRAY[a."sortOrder"] AS path,
              ARRAY[a.id]::text[] AS ancestors
       FROM "Article" a
       WHERE a."lawId" = $1
         AND a."lawRevisionId" = $2
         AND a."parentId" IS NULL
         AND a."deletedAt" IS NULL

       UNION ALL

       SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId",
              a."stableNodeKey", a."durableNodeKey", a."deletedAt",
              tree.path || a."sortOrder",
              tree.ancestors || a.id
       FROM "Article" a
       INNER JOIN document_tree tree ON a."parentId" = tree.id
       WHERE a."deletedAt" IS NULL
         AND a."lawRevisionId" = tree."lawRevisionId"
     ),
     current_scope as (
       SELECT path FROM document_tree WHERE id = $3 LIMIT 1
     )
     SELECT tree.id
     FROM document_tree tree
     CROSS JOIN current_scope current_scope
     JOIN "Law" tree_law ON tree_law.id = tree."lawId"
     JOIN "LawBookEntry" e
       ON e."lawId" = tree_law.id
      AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $4)
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     WHERE tree.level IN ('article', 'suppl_provision')
       AND tree.path > current_scope.path
       AND NOT ($3 = ANY(tree.ancestors))
       AND edition."editionKey" = $4
       AND ${treeScope}
     ORDER BY tree.path
     LIMIT 1`,
    current.lawId,
    current.lawRevisionId,
    scopeId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  const nextRoot = nextRoots[0];
  if (!nextRoot) return null;

  const next = await resolveChapterScopeId(nextRoot.id);
  if (!next.scopeRow || next.scopeId === scopeId) return null;
  if (
    next.scopeRow.lawId !== current.lawId ||
    next.scopeRow.lawRevisionId !== current.lawRevisionId
  ) {
    return null;
  }
  return toScrollScopeInfo(next.scopeRow);
}

/** article または suppl_provision をルートレベルと見なすか */
function isRootLevel(level: string): boolean {
  return level === "article" || level === "suppl_provision";
}

/** 指定スコープ自身の直下の子孫を取得する（スコープ自身は含まない）。 */
async function fetchScopeDescendants(scopeId: string): Promise<ArticleRow[]> {
  const treeScope = currentLawBookArticleScopeSql("tree", "e", "tree_law");
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
        AND a."lawRevisionId" = tree."lawRevisionId"
    )
    SELECT tree.*
    FROM tree
    JOIN "Law" tree_law ON tree_law.id = tree."lawId"
    JOIN "LawBookEntry" e
      ON e."lawId" = tree_law.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE edition."editionKey" = $2
      AND ${treeScope}
    ORDER BY path
    `,
    scopeId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows;
}

/**
 * 指定スコープ配下の全子孫を取得し、article/suppl_provision ルート単位にグループ化する。
 * getChapterArticlesWithTrees と同等のグループ化ロジックだが、附則もルートとして扱う。
 */
async function fetchGroupedArticlesInScope(scopeId: string): Promise<ChapterArticle[]> {
  const treeScope = currentLawBookArticleScopeSql("tree", "e", "tree_law");
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
        AND a."lawRevisionId" = tree."lawRevisionId"
    )
    SELECT tree.*
    FROM tree
    JOIN "Law" tree_law ON tree_law.id = tree."lawId"
    JOIN "LawBookEntry" e
      ON e."lawId" = tree_law.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE edition."editionKey" = $2
      AND ${treeScope}
    ORDER BY path
    `,
    scopeId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  // article/suppl_provision を root とし、それ以外を children にグループ化。
  // 行レコードは path 順（文書順）に並んでいる。
  const articles: ChapterArticle[] = [];
  let currentRoot: ArticleRow | null = null;
  let currentChildren: ArticleRow[] = [];

  for (const row of rows) {
    if (isRootLevel(row.level)) {
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

  return articles;
}

/**
 * 指定スコープ配下のルートArticleを、rootSeq（1始まり連番）でページング取得する。
 * 設計書§4.3: 章全件取得を廃止し、DB側で LIMIT 相当の絞り込みを行う。
 *
 * cursor仕様（1始まり）:
 * - startSeq..endSeq-1 のルートと、その全子孫を返す。
 * - ROW_NUMBER() OVER (ORDER BY path) で付与。path は文書順。
 *
 * 子孫取得方針（@>を使わない）:
 * 対象ルート範囲のルートID集合をCTEで特定 →
 * そのID集合のいずれかを祖先に持つ全ノードを再帰CTEで取得。
 */
async function fetchGroupedArticlesInScopePaged(
  scopeId: string,
  startSeq: number,
  endSeq: number,
): Promise<ChapterArticle[]> {
  if (startSeq >= endSeq) return [];
  const treeScope = currentLawBookArticleScopeSql("bt", "e", "bt_law");
  const rows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `
    WITH RECURSIVE
    base_tree AS (
      SELECT a.id, a."parentId", a.level, a."articleNumber",
             a."articleNumberNormalized", a."paragraphNumber", a."itemNumber",
             a."subitemNumber", a."columnNumber", a."tableCoords",
             a.title, a.caption, a.text, a."articleCaptionNormalized",
             a."sortOrder", a."stableNodeKey", a."durableNodeKey", a."deletedAt",
             a."lawRevisionId", a."lawId",
             l.name AS "lawName", 0 AS depth,
             ARRAY[a."sortOrder"] AS path
      FROM "Article" a
      JOIN "Law" l ON a."lawId" = l.id
      WHERE a."parentId" = $1 AND a."deletedAt" IS NULL
      UNION ALL
      SELECT a.id, a."parentId", a.level, a."articleNumber",
             a."articleNumberNormalized", a."paragraphNumber", a."itemNumber",
             a."subitemNumber", a."columnNumber", a."tableCoords",
             a.title, a.caption, a.text, a."articleCaptionNormalized",
             a."sortOrder", a."stableNodeKey", a."durableNodeKey", a."deletedAt",
             a."lawRevisionId", a."lawId",
             bt."lawName", bt.depth + 1,
             bt.path || a."sortOrder"
      FROM "Article" a
      INNER JOIN base_tree bt ON a."parentId" = bt.id
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = bt."lawRevisionId"
    ),
    numbered_roots as (
      SELECT id, path,
             ROW_NUMBER() OVER (ORDER BY path) AS root_seq
      FROM base_tree
      WHERE level IN ('article', 'suppl_provision')
    ),
    target_root_ids as (
      SELECT id FROM numbered_roots WHERE root_seq >= $2 AND root_seq < $3
    ),
    target_revision as (
      SELECT bt."lawRevisionId" AS "lawRevisionId"
      FROM target_root_ids tri
      JOIN base_tree bt ON bt.id = tri.id
      LIMIT 1
    ),
    subtree as (
      SELECT id FROM target_root_ids
      UNION ALL
      SELECT a.id
      FROM "Article" a
      INNER JOIN subtree ON a."parentId" = subtree.id
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = (SELECT "lawRevisionId" FROM target_revision)
    )
    SELECT bt.id, bt."parentId", bt.level, bt."articleNumber",
           bt."articleNumberNormalized", bt."paragraphNumber", bt."itemNumber",
           bt."subitemNumber", bt."columnNumber", bt."tableCoords",
           bt.title, bt.caption, bt.text, bt."articleCaptionNormalized",
           bt."sortOrder", bt."stableNodeKey", bt."lawRevisionId", bt."lawId",
           bt."lawName", bt.depth
    FROM base_tree bt
    JOIN subtree ON bt.id = subtree.id
    JOIN "Law" bt_law ON bt_law.id = bt."lawId"
    JOIN "LawBookEntry" e
      ON e."lawId" = bt_law.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $4)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE edition."editionKey" = $4
      AND ${treeScope}
    ORDER BY bt.path
    `,
    scopeId,
    startSeq,
    endSeq,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );

  return groupRowsIntoArticles(rows);
}

/** 行を ChapterArticle[] へグループ化（共通ヘルパ） */
function groupRowsIntoArticles(rows: ArticleRow[]): ChapterArticle[] {
  const articles: ChapterArticle[] = [];
  let currentRoot: ArticleRow | null = null;
  let currentChildren: ArticleRow[] = [];

  for (const row of rows) {
    if (isRootLevel(row.level)) {
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
  return articles;
}

/** スコープ内のルート総数（cursor計算用） */
async function countRootArticlesInScope(scopeId: string): Promise<number> {
  const treeScope = currentLawBookArticleScopeSql("bt", "e", "bt_law");
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `
    WITH RECURSIVE base_tree AS (
      SELECT a.*, ARRAY[a."sortOrder"] AS path
      FROM "Article" a
      WHERE a."parentId" = $1 AND a."deletedAt" IS NULL
      UNION ALL
      SELECT a.*, base_tree.path || a."sortOrder"
      FROM "Article" a
      INNER JOIN base_tree ON a."parentId" = base_tree.id
      WHERE a."deletedAt" IS NULL
        AND a."lawRevisionId" = base_tree."lawRevisionId"
    )
    SELECT COUNT(*)::bigint AS count
    FROM base_tree bt
    JOIN "Law" bt_law ON bt_law.id = bt."lawId"
    JOIN "LawBookEntry" e
      ON e."lawId" = bt_law.id
     AND e."editionId" = (SELECT edition_inner.id FROM "LawBookEdition" edition_inner WHERE edition_inner."editionKey" = $2)
    JOIN "LawBookEdition" edition ON edition.id = e."editionId"
    WHERE edition."editionKey" = $2
      AND ${treeScope}
      AND bt.level IN ('article', 'suppl_provision')
    `,
    scopeId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return Number(rows[0]?.count ?? 0);
}

/** 対象Article（または子孫）が属するルートの連番（1始まり）を取得 */
async function findRootSeq(scopeId: string, articleId: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ rootSeq: number }>>(
    `
    WITH RECURSIVE
    base_tree AS (
      SELECT a.*, ARRAY[a."sortOrder"] AS path
      FROM "Article" a
      WHERE a."parentId" = $1 AND a."deletedAt" IS NULL
      UNION ALL
      SELECT a.*, base_tree.path || a."sortOrder"
      FROM "Article" a
      INNER JOIN base_tree ON a."parentId" = base_tree.id
      WHERE a."deletedAt" IS NULL
    ),
    numbered_roots AS (
      SELECT id, path, ROW_NUMBER() OVER (ORDER BY path) AS root_seq
      FROM base_tree
      WHERE level IN ('article', 'suppl_provision')
    ),
    ancestor_chain AS (
      SELECT id, "parentId" FROM "Article" WHERE id = $2 AND "deletedAt" IS NULL
      UNION ALL
      SELECT a.id, a."parentId"
      FROM "Article" a
      INNER JOIN ancestor_chain ac ON a.id = ac."parentId"
      WHERE a."deletedAt" IS NULL
    )
    SELECT nr.root_seq::int AS "rootSeq"
    FROM numbered_roots nr
    WHERE nr.id IN (
      SELECT id FROM ancestor_chain
      INTERSECT
      SELECT id FROM numbered_roots
    )
    ORDER BY nr.root_seq
    LIMIT 1
    `,
    scopeId,
    articleId,
  );
  return rows[0]?.rootSeq ?? 1;
}

/**
 * 初期ウィンドウ取得。
 * 対象Articleを中心に前後 `half` 件（既定5）のArticleルートと全子孫を返す。
 * 初期取得単体ではscope境界を越えない。
 * DBページング対応: 章全件取得せず、対象周辺のみ取得する。
 * cursor は1始まりのルート連番。
 */
export async function getChapterWindow(
  articleId: string,
  half = 5,
): Promise<{
  articles: ChapterArticle[];
  scopeAncestor: ArticleRow | null;
  beforeCursor: string | null;
  afterCursor: string | null;
  /** スコープ解決に使ったstableNodeKeyベースのキャッシュキー用識別子 */
  chapterKey: string | null;
  scopeId: string | null;
  scope: ScrollScopeInfo;
  nextScope: ScrollScopeInfo | null;
}> {
  const { scopeId, scopeRow } = await resolveChapterScopeId(articleId);
  if (!scopeRow) {
    throw new Error(`Scroll scope not found for Article: ${articleId}`);
  }

  // スコープ自身が article/suppl_provision ルートの場合の特別扱い
  const scopeIsRoot = scopeRow && isRootLevel(scopeRow.level);

  // 対象ルートの連番（1始まり）を特定
  let targetSeq: number;
  if (scopeIsRoot && scopeRow!.id === articleId) {
    targetSeq = 1;
  } else {
    targetSeq = await findRootSeq(scopeId, articleId);
  }

  // 初期ウィンドウ: [targetSeq - half, targetSeq + half]（1始まり・両端含む）
  const start = Math.max(1, targetSeq - half);
  const end = targetSeq + half; // fetchGroupedArticlesInScopePaged は [start, end+1)

  let windowArticles = await fetchGroupedArticlesInScopePaged(scopeId, start, end + 1);

  // スコープ自身がルートの場合、先頭へ追加
  if (scopeIsRoot && start === 1) {
    const scopeDescendants = await fetchScopeDescendants(scopeId);
    const scopeRoot: ChapterArticle = { root: scopeRow!, children: scopeDescendants };
    windowArticles = [scopeRoot, ...windowArticles];
  }

  // cursor（1始まり）
  const totalCount = await countRootArticlesInScope(scopeId);
  const effectiveTotal = scopeIsRoot ? totalCount + 1 : totalCount;
  const lastReturnedSeq = start + windowArticles.length - 1;
  const beforeCursor = start > 1 ? String(Math.max(1, start - half)) : null;
  const afterCursor = lastReturnedSeq < effectiveTotal ? String(lastReturnedSeq + 1) : null;

  const chapterKey = scopeRow?.stableNodeKey ?? scopeId;
  const scope = toScrollScopeInfo(scopeRow);
  const nextScope = await getNextScrollScope(scopeId);

  return {
    articles: windowArticles,
    scopeAncestor: scopeRow,
    beforeCursor,
    afterCursor,
    chapterKey,
    scopeId,
    scope,
    nextScope,
  };
}

/**
 * 追加取得（ページング）。
 * direction=before: cursor(1始まり連番)より前の `limit` 件。
 * direction=after: cursor(1始まり連番)以降の `limit` 件。
 * 追加取得単体ではscope境界を越えない。
 * DBページング対応: 章全件取得せず、対象範囲のみ取得する。
 */
export async function getChapterArticlesPaginated(
  scopeId: string,
  cursorSeq: number, // 1始まり
  direction: "before" | "after",
  limit = 10,
): Promise<{
  articles: ChapterArticle[];
  beforeCursor: string | null;
  afterCursor: string | null;
  scope: ScrollScopeInfo;
  nextScope: ScrollScopeInfo | null;
}> {
  const scopeRows = await prisma.$queryRawUnsafe<ArticleRow[]>(
    `SELECT a.*, l.name AS "lawName", 0 AS depth
     FROM "Article" a
     JOIN "Law" l ON l.id = a."lawId"
     WHERE a.id = $1 AND a."deletedAt" IS NULL
     LIMIT 1`,
    scopeId,
  );
  const scopeRow = scopeRows[0];
  if (!scopeRow) {
    throw new Error(`Scroll scope not found: ${scopeId}`);
  }

  const totalCount = await countRootArticlesInScope(scopeId);
  const scopeIsRoot = isRootLevel(scopeRow.level);
  const effectiveTotal = scopeIsRoot ? totalCount + 1 : totalCount;
  let start: number;
  let end: number; // fetchGroupedArticlesInScopePaged の endSeq（排他上限）

  if (direction === "before") {
    end = cursorSeq; // cursorの直前まで
    start = Math.max(1, cursorSeq - limit);
  } else {
    start = cursorSeq;
    end = Math.min(effectiveTotal + 1, cursorSeq + limit);
  }

  // article / suppl_provision がscope自身の場合は、それを論理連番1として扱う。
  // 子孫側の連番は1始まりなので、scope自身の分だけoffsetする。
  const descendantStart = scopeIsRoot ? Math.max(1, start - 1) : start;
  const descendantEnd = scopeIsRoot ? Math.max(1, end - 1) : end;
  let windowArticles = await fetchGroupedArticlesInScopePaged(
    scopeId,
    descendantStart,
    descendantEnd,
  );
  if (scopeIsRoot && start === 1) {
    const scopeDescendants = await fetchScopeDescendants(scopeId);
    windowArticles = [
      { root: scopeRow, children: scopeDescendants },
      ...windowArticles,
    ];
  }
  const lastReturnedSeq = start + windowArticles.length - 1;
  const beforeCursor = start > 1 ? String(Math.max(1, start - limit)) : null;
  const afterCursor =
    lastReturnedSeq < effectiveTotal ? String(lastReturnedSeq + 1) : null;

  const scope = toScrollScopeInfo(scopeRow);
  const nextScope = await getNextScrollScope(scopeId);

  return {
    articles: windowArticles,
    beforeCursor,
    afterCursor,
    scope,
    nextScope,
  };
}

/**
 * Article ID（ルートまたは子孫）が属するルートArticle IDを解決する。
 * 設計書§3.3: 項・号URLの場合、対象Articleを含む章と初期ウィンドウを解決する。
 *
 * @param articles 検索対象のChapterArticleリスト
 * @param articleId ルートまたは子孫のArticle ID
 * @returns ルートArticle ID。見つからなければ null。
 */
export function findRootArticleIdFromList(
  articles: ChapterArticle[],
  articleId: string,
): string | null {
  // ルート直接一致
  const directMatch = articles.find((a) => a.root.id === articleId);
  if (directMatch) return directMatch.root.id;

  // 子孫ノードから親ルートを特定
  const parentMatch = articles.find((a) =>
    a.children.some((c) => c.id === articleId),
  );
  return parentMatch?.root.id ?? null;
}
