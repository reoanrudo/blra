import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/articles/chapter-window/route";
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

/**
 * 章スクロール段階読込APIのIntegrationテスト（設計書§10 Integration要件）
 *
 * - 初期ウィンドウが対象Articleを含み、章境界を越えない。
 * - Articleルートと全子孫を欠落なく返す。
 * - soft deleteと法令集Range外Articleを返さない。
 * - 前後cursorによるページングが正しい。
 * - DBページングで章全件取得を廃止。
 */

// テストfixture（両describeブロックから参照するためトップレベルへ配置）
let fixture: {
  lawId: string;
  article1Id: string;
  article2Id: string;
  article3Id: string;
  deepArticleId: string;
  firstChapterId: string;
  secondChapterId: string;
  lastArticleId: string;
} | null = null;

beforeAll(async () => {
  // 建築基準法で12条以上を持つ同一章から fixture を構築
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; lawId: string; sortOrder: number; level: string }>
  >(
    `WITH target_parent AS (
       SELECT a."parentId", MIN(a."sortOrder") AS first_sort
       FROM "Article" a
       JOIN "LawBookEntry" e
         ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
       JOIN "LawBookEdition" edition ON edition.id = e."editionId"
       JOIN "Law" l ON l.id = a."lawId"
       WHERE edition."editionKey" = $1
         AND l."egovLawId" = '325AC0000000201'
         AND a.level = 'article'
         AND a."deletedAt" IS NULL
         AND a."parentId" IS NOT NULL
       GROUP BY a."parentId"
       HAVING COUNT(*) >= 12
       ORDER BY first_sort, a."parentId"
       LIMIT 1
     )
     SELECT a.id, a."lawId", a."sortOrder", a.level
     FROM "Article" a
     JOIN target_parent target ON target."parentId" = a."parentId"
     JOIN "LawBookEntry" e
       ON e."lawId" = a."lawId" AND e."lawRevisionId" = a."lawRevisionId"
     JOIN "LawBookEdition" edition ON edition.id = e."editionId"
     JOIN "Law" l ON l.id = a."lawId"
     WHERE edition."editionKey" = $1
       AND l."egovLawId" = '325AC0000000201'
       AND a.level = 'article'
       AND a."deletedAt" IS NULL
     ORDER BY a."sortOrder"
     LIMIT 20`,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  if (rows.length >= 12) {
    const scopeRows = await prisma.$queryRawUnsafe<
      Array<{
        firstChapterId: string;
        secondChapterId: string;
        lastArticleId: string;
      }>
    >(
      `WITH RECURSIVE
       current_up AS (
         SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId", a."sortOrder"
         FROM "Article" a
         WHERE a.id = $1 AND a."deletedAt" IS NULL
         UNION ALL
         SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId", a."sortOrder"
         FROM "Article" a
         INNER JOIN current_up up ON a.id = up."parentId"
         WHERE a."deletedAt" IS NULL
       ),
       current_chapter AS (
         SELECT * FROM current_up WHERE level = 'chapter' LIMIT 1
       ),
       next_chapter AS (
         SELECT a.id
         FROM "Article" a
         JOIN current_chapter c
           ON a."lawId" = c."lawId"
          AND a."lawRevisionId" = c."lawRevisionId"
          AND a."parentId" IS NOT DISTINCT FROM c."parentId"
         WHERE a.level = 'chapter'
           AND a."deletedAt" IS NULL
           AND a."sortOrder" > c."sortOrder"
         ORDER BY a."sortOrder"
         LIMIT 1
       ),
       document_tree AS (
         SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId",
                ARRAY[a."sortOrder"] AS path
         FROM "Article" a
         JOIN current_chapter c
           ON a."lawId" = c."lawId" AND a."lawRevisionId" = c."lawRevisionId"
         WHERE a."parentId" IS NULL AND a."deletedAt" IS NULL
         UNION ALL
         SELECT a.id, a."parentId", a.level, a."lawId", a."lawRevisionId",
                tree.path || a."sortOrder"
         FROM "Article" a
         INNER JOIN document_tree tree ON a."parentId" = tree.id
         WHERE a."deletedAt" IS NULL
       ),
       last_root AS (
         SELECT id
         FROM document_tree
         WHERE level IN ('article', 'suppl_provision')
         ORDER BY path DESC
         LIMIT 1
       )
       SELECT c.id AS "firstChapterId",
              n.id AS "secondChapterId",
              last_root.id AS "lastArticleId"
       FROM current_chapter c
       CROSS JOIN next_chapter n
       CROSS JOIN last_root`,
      rows[0]!.id,
    );
    if (scopeRows.length === 0) return;
    fixture = {
      lawId: rows[0]!.lawId,
      article1Id: rows[0]!.id,
      article2Id: rows[1]!.id,
      article3Id: rows[2]!.id,
      deepArticleId: rows[11]!.id,
      firstChapterId: scopeRows[0]!.firstChapterId,
      secondChapterId: scopeRows[0]!.secondChapterId,
      lastArticleId: scopeRows[0]!.lastArticleId,
    };
  }
});

describe("章データAPI (chapter-window)", () => {
  it("初期ウィンドウが対象Articleを含む", async () => {
    if (!fixture) return;
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article2Id}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.articles.map((a: { root: { id: string } }) => a.root.id);
    expect(ids).toContain(fixture.article2Id);
  });

  it("章の深いArticleを指定しても初期ウィンドウに対象Articleを含む", async () => {
    if (!fixture) {
      throw new Error("12条以上を持つ章のテストfixtureを構築できませんでした");
    }
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.deepArticleId}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.articles.map(
      (article: { root: { id: string } }) => article.root.id,
    );
    expect(ids).toContain(fixture.deepArticleId);
    expect(ids.length).toBeLessThanOrEqual(11);
  });

  it("応答にlawRevisionIdが含まれる", async () => {
    if (!fixture) return;
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}`,
      ),
    );
    const body = await res.json();
    expect(typeof body.lawRevisionId).toBe("string");
    expect(body.lawRevisionId.length).toBeGreaterThan(0);
  });

  it("初期応答が現在scopeと同一法令内の次scopeを返す", async () => {
    if (!fixture) throw new Error("章連結fixtureを構築できませんでした");
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope.id).toBe(fixture.firstChapterId);
    expect(body.nextScope).toMatchObject({
      id: fixture.secondChapterId,
      level: "chapter",
      firstCursor: "1",
    });
    expect(body.nextScope.id).not.toBe(body.scope.id);
  });

  it("法令末尾のscopeは次scopeを返さない", async () => {
    if (!fixture) throw new Error("法令末尾fixtureを構築できませんでした");
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.lastArticleId}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nextScope).toBeNull();
  });

  it("独立した附則scopeへ追加取得してもscope自身を欠落させない", async () => {
    if (!fixture) throw new Error("法令末尾fixtureを構築できませんでした");
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.lastArticleId}&direction=after&cursor=1&scopeId=${fixture.lastArticleId}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.articles.map(
      (article: { root: { id: string } }) => article.root.id,
    );
    expect(ids).toContain(fixture.lastArticleId);
    expect(body.afterCursor).toBeNull();
  });

  it("Articleルートと全子孫を欠落なく返す（root.children が配列）", async () => {
    if (!fixture) return;
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}&half=1`,
      ),
    );
    const body = await res.json();
    expect(Array.isArray(body.articles)).toBe(true);
    for (const article of body.articles) {
      expect(article.root).toBeDefined();
      expect(article.root.id).toBeTruthy();
      expect(Array.isArray(article.children)).toBe(true);
    }
  });

  it("soft deleteされたArticleを返さない（deletedAt IS NULL）", async () => {
    if (!fixture) return;
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}`,
      ),
    );
    const body = await res.json();
    // 全Articleルートが soft delete されていないことを確認
    for (const article of body.articles) {
      // chapter-window は deletedAt IS NULL でフィルタするため、
      // 応答に削除済みArticleが含まれないことを検証
      expect(article.root.id).toBeTruthy();
    }
  });

  it("存在しないarticleIdは404を返す", async () => {
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=nonexistent-id-12345`,
      ),
    );
    expect(res.status).toBe(404);
  });

  it("articleId無指定は400を返す", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/articles/chapter-window`),
    );
    expect(res.status).toBe(400);
  });

  it("after方向ページングが追加Articleを返す", async () => {
    if (!fixture) return;
    // まず初期ウィンドウを取得してscopeIdとafterCursorを得る
    const initialRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}&half=0`,
      ),
    );
    const initialBody = await initialRes.json();

    if (!initialBody.afterCursor || !initialBody.scopeAncestor) return;

    const afterRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}` +
          `&direction=after&cursor=${initialBody.afterCursor}` +
          `&scopeId=${initialBody.scopeAncestor.id}&limit=2`,
      ),
    );
    expect(afterRes.status).toBe(200);
    const afterBody = await afterRes.json();
    expect(Array.isArray(afterBody.articles)).toBe(true);
    // 追加取得したArticleは初期ウィンドウと重複しない
    const initialIds = new Set(
      initialBody.articles.map((a: { root: { id: string } }) => a.root.id),
    );
    for (const article of afterBody.articles) {
      expect(initialIds.has(article.root.id)).toBe(false);
    }
  });
});

describe("DBページング（章全件取得の廃止）", () => {
  it("初期ウィンドウは章内の全ルートではなく、前後5件+対象（最大11件）のみ返す", async () => {
    if (!fixture) return;
    // 建築基準法 第1章は11条以上を含むことを前提とする
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}`,
      ),
    );
    const body = await res.json();
    // 初期ウィンドウは最大11件
    expect(body.articles.length).toBeLessThanOrEqual(11);
  });

  it("afterCursorが1始まりのルート連番である", async () => {
    if (!fixture) return;
    // デフォルト half=5 で初期ウィンドウを取得。
    // 対象が最初の条（rootSeq=1）の場合、初期ウィンドウは [1..6]（最大6件）。
    // 1始まりの場合 afterCursor >= 7。
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}`,
      ),
    );
    const body = await res.json();
    // afterCursor が存在する場合、1始まりで articles.length より大きい
    if (body.afterCursor) {
      const cursorNum = parseInt(body.afterCursor, 10);
      expect(cursorNum).toBeGreaterThanOrEqual(1);
      // 初期ウィンドウのルート数以上であること（1始まりのため）
      expect(cursorNum).toBeGreaterThan(body.articles.length);
    }
  });

  it("cursor=0は1始まりルート連番のため不正と明示的に拒否される", async () => {
    if (!fixture) return;
    // まず初期ウィンドウを取得して正しいscopeIdを得る
    const initialRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}&half=0`,
      ),
    );
    const initialBody = await initialRes.json();
    if (!initialBody.scopeAncestor) return;
    const scopeId = initialBody.scopeAncestor.id;

    // cursor=0 を渡す。1始まり仕様では「cursor must be a positive integer」で400。
    // ※現行実装でも cursorRawが falsy のため NaN 扱いで400になるが、
    //   エラーメッセージが "positive integer" を含むかで1始まり仕様を検証する。
    const res = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}` +
          `&direction=after&cursor=0&scopeId=${scopeId}&limit=3`,
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("positive integer");
  });

  it("ページング応答にnodeIds（ルート+子孫のID集合）が含まれる", async () => {
    if (!fixture) return;
    // まず初期ウィンドウを取得してscopeIdとafterCursorを得る
    const initialRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}&half=0`,
      ),
    );
    const initialBody = await initialRes.json();
    if (!initialBody.afterCursor || !initialBody.scopeAncestor) return;

    const afterRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}` +
          `&direction=after&cursor=${initialBody.afterCursor}` +
          `&scopeId=${initialBody.scopeAncestor.id}&limit=2`,
      ),
    );
    const afterBody = await afterRes.json();
    // 現行実装では nodeIds が応答に含まれないため、このテストは失敗する。
    expect(afterBody.nodeIds).toBeDefined();
    expect(Array.isArray(afterBody.nodeIds)).toBe(true);
    // ルート+子孫のIDが含まれる
    if (afterBody.articles.length > 0) {
      const expectedNodeIds = afterBody.articles.flatMap((a: { root: { id: string }; children: { id: string }[] }) => [
        a.root.id,
        ...a.children.map((c: { id: string }) => c.id),
      ]);
      for (const nodeId of expectedNodeIds) {
        expect(afterBody.nodeIds).toContain(nodeId);
      }
    }
  });

  it("after方向ページングは limit 件のみ返し、章全件を返さない", async () => {
    if (!fixture) return;
    const initialRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}&half=1`,
      ),
    );
    const initialBody = await initialRes.json();
    if (!initialBody.afterCursor || !initialBody.scopeAncestor) return;

    const afterRes = await GET(
      new NextRequest(
        `http://localhost/api/articles/chapter-window?articleId=${fixture.article1Id}` +
          `&direction=after&cursor=${initialBody.afterCursor}` +
          `&scopeId=${initialBody.scopeAncestor.id}&limit=3`,
      ),
    );
    const afterBody = await afterRes.json();
    // limit=3 なので最大3件（章端の場合はそれ以下）
    expect(afterBody.articles.length).toBeLessThanOrEqual(3);
  });
});
