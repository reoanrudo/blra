# e-Gov型・全文法令リーダー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `hourei_rag` DBの表示規則を維持したまま、現在の1法令を全文一括取得・一括描画し、遠方条文へ追加通信なしで移動できる2列法令リーダーを構築する。

**Architecture:** `/articles/{articleId}` は対象Articleの法令版だけを解決し、クライアントの `FullLawReader` が版単位の全文APIを1回取得する。全文APIは文書順ノード、目次、DB保存済み解決リンクを返し、`FullLawViewer` が既存の法令描画関数で全条文を単一スクロールへ描画する。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、PostgreSQL 16、Tailwind CSS 3、Vitest 4、Playwright

## Global Constraints

- 正本DBは `web/` の Prisma / `hourei_rag` とし、`src/` のKysely / `blra` DBへ書き込まない。
- e-GovのHTML・CSSはコピーせず、DB階層とBLRA既存描画規則を利用する。
- 読み込むのは現在開いている1法令の現行収録版だけとし、全120法令を同時取得しない。
- Prismaスキーマ変更と新規npm依存を行わない。
- `ChapterScrollViewer` と既存の分割取得APIは本計画では削除しない。
- 全文ビューアで `detectRuntimeLinks` を実行しない。DB保存済みかつ解決済みのリンクだけを返す。
- 右実務パネル、適用時点バー、保存、注釈、確認項目、閲覧履歴を読者画面に表示しない。
- 通常スクロールと同一法令内の目次移動で追加通信を行わない。
- 全文読込後の遠方アンカー移動は本番ビルドで100ms以内を受入基準とする。
- 既存の未コミット変更は利用者の資産として保持し、本計画に関係する箇所だけを編集する。

---

## File Structure

### 新規ファイル

- `web/src/lib/article/full-law-document.ts` — 全文DTO、表示ブロック、アンカー、目次変換の純粋関数
- `web/src/lib/article/full-law-repository.ts` — 版単位の全文・目次・リンクDB取得
- `web/src/lib/article/full-law-client.ts` — 全文API取得とメモリキャッシュ
- `web/src/hooks/useFullLawDocument.ts` — loading / ready / error / retry状態
- `web/src/app/api/law-revisions/[id]/document/route.ts` — 全文API、ETag、Cache-Control
- `web/src/components/article/FullLawViewer.tsx` — 全文一括描画と初期位置合わせ
- `web/src/components/article/FullLawReader.tsx` — 全文取得、レイアウト、左パネル、本文の結線
- `web/src/__tests__/full-law-document.test.ts` — 純粋関数テスト
- `web/src/__tests__/full-law-client.test.ts` — fetch・キャッシュテスト
- `web/src/__tests__/integration/full-law-document.test.ts` — 実DB取得・API契約テスト
- `web/e2e/full-law-reader.spec.ts` — 全文、遠方移動、通信本数、簡素化UIのE2E

### 変更ファイル

- `docs/design-spec.md` — Phase 1 Reader Amendmentを追記
- `web/src/lib/article/article-renderer.tsx` — 条・項・号の固定DOMアンカー
- `web/src/components/article/ChapterArticleBlock.tsx` — 条文ルートの固定DOMアンカー
- `web/src/components/article/ArticleLayout.tsx` — 3列から2列へ簡素化
- `web/src/components/layout/LeftPanel.tsx` — 目次／検索だけに限定
- `web/src/components/toc/TocPanel.tsx` — 全文APIの目次をpropsで受け取る
- `web/src/components/toc/TocTree.tsx` — 同一法令内のDOMスクロールを正本化
- `web/src/components/search/SearchPracticePanel.tsx` — 検索結果／論点索引だけに限定
- `web/src/components/article/ScrollUrlSync.tsx` — Applicability依存を除き、URLを `/articles/{id}` へ同期
- `web/src/app/articles/[id]/page.tsx` — 全文Reader shellだけを返すServer Componentへ縮小
- `web/e2e/scroll-mode.spec.ts` — 旧段階読込前提のテストを全文前提へ置換

---

### Task 1: Phase 1正本化と全文ドメイン契約

**Files:**
- Modify: `docs/design-spec.md`
- Create: `web/src/lib/article/full-law-document.ts`
- Test: `web/src/__tests__/full-law-document.test.ts`

**Interfaces:**
- Consumes: `ArticleRow`、`ChapterArticle`、`TocNode`、`OutgoingLinkRow`
- Produces: `FullLawDocument`、`FullLawNode`、`FullLawBlock`、`buildFullLawBlocks()`、`buildFullLawToc()`、`fullLawAnchorId()`

- [ ] **Step 1: `design-spec.md` にPhase 1 Reader Amendmentを追記する**

`docs/design-spec.md` の変更履歴直後に、次の規範文を追加する。

```markdown
### Phase 1 Reader Amendment（2026-08-02）

Phase 1は現行e-Govデータを読む法令リーダーを優先する。本段階ではApplicabilityContextによる版切替、NoticeBand、案件保存、注釈、根拠ペイン、権限不足状態を利用者UIへ実装しない。本文は選択した1法令の現行収録版を全文一括取得し、単一スクロールへ描画する。§4.3、§19.5、§19.10.3、§19.10.5〜6、§19.14と食い違う場合、本AmendmentをPhase 1の正本とする。
```

- [ ] **Step 2: 失敗する純粋関数テストを書く**

`web/src/__tests__/full-law-document.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildFullLawBlocks,
  buildFullLawToc,
  fullLawAnchorId,
  type FullLawNode,
} from "@/lib/article/full-law-document";

const rows: FullLawNode[] = [
  node({ id: "chapter-1", parentId: "root", level: "chapter", title: "第一章　総則", depth: 1, path: [1, 1] }),
  node({ id: "article-1", parentId: "chapter-1", level: "article", articleNumber: "一", articleNumberNormalized: "1", depth: 2, path: [1, 1, 1] }),
  node({ id: "paragraph-1", parentId: "article-1", level: "paragraph", paragraphNumber: "1", text: "本文", depth: 3, path: [1, 1, 1, 1] }),
  node({ id: "article-2", parentId: "chapter-1", level: "article", articleNumber: "二", articleNumberNormalized: "2", depth: 2, path: [1, 1, 2] }),
];

describe("full law document", () => {
  it("章見出しと条文を文書順の表示ブロックへ変換する", () => {
    const blocks = buildFullLawBlocks(rows, "建築基準法");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "article", "article"]);
    expect(blocks[1]).toMatchObject({ kind: "article", article: { root: { id: "article-1" } } });
  });

  it("目次対象だけを保持し算用数字表示へ渡せる", () => {
    expect(buildFullLawToc(rows).map((item) => item.id)).toEqual(["chapter-1", "article-1", "article-2"]);
  });

  it("Article IDをURL安全な固定DOM IDへ変換する", () => {
    expect(fullLawAnchorId("art_325ac_000002")).toBe("law-node-art_325ac_000002");
  });
});
```

同ファイル内のfixture helperは次を使用する。

```typescript
function node(overrides: Partial<FullLawNode>): FullLawNode {
  return {
    id: "node",
    parentId: null,
    level: "article",
    articleNumber: null,
    articleNumberNormalized: null,
    paragraphNumber: null,
    itemNumber: null,
    subitemNumber: null,
    columnNumber: null,
    tableCoords: null,
    title: null,
    caption: null,
    text: null,
    articleCaptionNormalized: null,
    sortOrder: 1,
    depth: 0,
    lawId: "law-1",
    regulationType: null,
    stableNodeKey: "stable-node",
    lawRevisionId: "revision-1",
    path: [1],
    ...overrides,
  };
}
```

- [ ] **Step 3: テストが未実装で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/full-law-document.test.ts`

Expected: FAIL — `@/lib/article/full-law-document` が存在しない。

- [ ] **Step 4: 全文DTOと純粋関数を実装する**

`web/src/lib/article/full-law-document.ts` の主要契約:

```typescript
export interface FullLawNode extends Omit<ArticleRow, "lawName"> {
  path: number[];
}

export interface FullLawDocument {
  law: { id: string; egovLawId: string; name: string; shortName: string | null };
  revision: { id: string; editionKey: string; sourceDate: string | null };
  toc: TocNode[];
  nodes: FullLawNode[];
  linksBySource: Record<string, OutgoingLinkRow[]>;
}

export type FullLawBlock =
  | { kind: "heading"; node: ArticleRow }
  | { kind: "article"; article: ChapterArticle };

export function fullLawAnchorId(articleId: string): string {
  return `law-node-${articleId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
```

`buildFullLawBlocks()` は `chapter` / `section` / `subsection` をheading、`article` / `suppl_provision` / `appdx_table` をArticle rootとして扱い、後続の子孫を次のrootまで `children` へ集める。`buildFullLawToc()` は現行 `/api/law-toc` と同じlevel集合だけを残し、附則は既存 `groupSupplementaryProvisions()` でまとめる。

- [ ] **Step 5: 単体テストを通す**

Run: `cd web && npx vitest run src/__tests__/full-law-document.test.ts`

Expected: PASS — 3 tests。

- [ ] **Step 6: Task 1をコミットする**

```bash
git add docs/design-spec.md web/src/lib/article/full-law-document.ts web/src/__tests__/full-law-document.test.ts
git commit -m "feat(reader): define full-law document contract"
```

---

### Task 2: 版単位の全文Repository

**Files:**
- Create: `web/src/lib/article/full-law-repository.ts`
- Test: `web/src/__tests__/integration/full-law-document.test.ts`

**Interfaces:**
- Consumes: `FullLawDocument`、`CURRENT_LAW_BOOK_EDITION_KEY`、`lawBookArticleScopeSql()`
- Produces: `getFullLawDocument(lawRevisionId: string): Promise<FullLawDocument | null>`

- [ ] **Step 1: 実DB統合テストを書く**

`web/src/__tests__/integration/full-law-document.test.ts` に、建築基準法の現行 `lawRevisionId` をfixtureとして取得し、次を検証する。

```typescript
const prisma = new PrismaClient();
let revisionId: string | null = null;
let civilRevisionId: string | null = null;
let civilArticle208Id: string | null = null;

beforeAll(async () => {
  try {
    await prisma.$connect();
    const building = await prisma.lawBookEntry.findFirst({
      where: {
        edition: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
        law: { egovLawId: "325AC0000000201" },
      },
      select: { lawRevisionId: true },
    });
    revisionId = building?.lawRevisionId ?? null;
    const civil208 = await prisma.article.findFirst({
      where: {
        law: { egovLawId: "129AC0000000089" },
        level: "article",
        articleNumberNormalized: "208",
        deletedAt: null,
      },
      select: { id: true, lawRevisionId: true },
    });
    civilRevisionId = civil208?.lawRevisionId ?? null;
    civilArticle208Id = civil208?.id ?? null;
  } catch {
    revisionId = null;
    civilRevisionId = null;
    civilArticle208Id = null;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

```typescript
it("建築基準法の収録全文を文書順で返す", async () => {
  if (!revisionId) return;
  const document = await getFullLawDocument(revisionId);
  expect(document?.law.egovLawId).toBe("325AC0000000201");
  expect(document?.nodes.length).toBeGreaterThan(2_000);
  expect(document?.nodes.some((node) => node.articleNumberNormalized === "107")).toBe(true);
  expect(document?.toc.every((node) => document.nodes.some((row) => row.id === node.id))).toBe(true);
});

it("soft delete済みノードと未収録範囲を返さない", async () => {
  if (!civilRevisionId || !civilArticle208Id) return;
  const document = await getFullLawDocument(civilRevisionId);
  expect(document?.nodes.some((node) => node.id === civilArticle208Id)).toBe(false);
  const deleted = await prisma.article.findMany({
    where: { lawRevisionId: civilRevisionId, deletedAt: { not: null } },
    select: { id: true },
  });
  const returned = new Set(document?.nodes.map((node) => node.id));
  expect(deleted.some((node) => returned.has(node.id))).toBe(false);
});

it("DB保存済みの解決リンクだけをsourceId別に返す", async () => {
  if (!revisionId) return;
  const document = await getFullLawDocument(revisionId);
  for (const links of Object.values(document?.linksBySource ?? {})) {
    expect(links.every((link) => link.isResolved && link.targetId)).toBe(true);
  }
});
```

既存integration testと同じくDBへ接続できない場合はfixtureを `null` にし、その環境では安全にskipする。DBデータは変更しない。

- [ ] **Step 2: Repository未実装で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/full-law-document.test.ts`

Expected: FAIL — `getFullLawDocument` が存在しない。

- [ ] **Step 3: 全文Repositoryを実装する**

`getFullLawDocument()` は次の3クエリを `Promise.all` で実行する。

```typescript
export async function getFullLawDocument(
  lawRevisionId: string,
): Promise<FullLawDocument | null> {
  const [metadata, nodes, links] = await Promise.all([
    getRevisionMetadata(lawRevisionId),
    getRevisionNodes(lawRevisionId),
    getRevisionResolvedLinks(lawRevisionId),
  ]);
  if (!metadata || nodes.length === 0) return null;
  const linksBySource = links.reduce<Record<string, OutgoingLinkRow[]>>(
    (grouped, link) => {
      (grouped[link.sourceId] ??= []).push(link);
      return grouped;
    },
    {},
  );
  return {
    law: metadata.law,
    revision: metadata.revision,
    nodes,
    toc: buildFullLawToc(nodes),
    linksBySource,
  };
}
```

ノードクエリは再帰CTEで `path` と `depth` を作る。最終SELECTで `LawBookEntry`、`LawBookEdition`、`lawBookArticleScopeSql("tree", "entry")` を適用し、`deletedAt IS NULL` と現在の `editionKey` を必須にする。

リンククエリはsource Articleを `lawRevisionId` で限定し、`Link.isResolved = true`、target Articleの `deletedAt IS NULL`、target側の現行法令集収録条件を必須にする。Article ID配列をSQLパラメータへ展開しない。

- [ ] **Step 4: 統合テストを通す**

Run: `cd web && npx vitest run src/__tests__/integration/full-law-document.test.ts`

Expected: PASS。

- [ ] **Step 5: 既存の収録範囲テストを通す**

Run: `cd web && npx vitest run src/__tests__/integration/law-book-route-scope.test.ts`

Expected: PASS。

- [ ] **Step 6: Task 2をコミットする**

```bash
git add web/src/lib/article/full-law-repository.ts web/src/__tests__/integration/full-law-document.test.ts
git commit -m "feat(reader): load a complete law revision"
```

---

### Task 3: 全文API・ETag・クライアントキャッシュ

**Files:**
- Create: `web/src/app/api/law-revisions/[id]/document/route.ts`
- Create: `web/src/lib/article/full-law-client.ts`
- Create: `web/src/hooks/useFullLawDocument.ts`
- Test: `web/src/__tests__/full-law-client.test.ts`
- Modify Test: `web/src/__tests__/integration/full-law-document.test.ts`

**Interfaces:**
- Consumes: `getFullLawDocument()`
- Produces: `GET /api/law-revisions/{id}/document`、`fetchFullLawDocument()`、`useFullLawDocument()`

- [ ] **Step 1: API契約の失敗テストを追加する**

```typescript
it("全文APIはETagと再検証可能なキャッシュヘッダーを返す", async () => {
  if (!revisionId) return;
  const response = await getDocument(
    new NextRequest(`http://localhost/api/law-revisions/${revisionId}/document`),
    { params: { id: revisionId } },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
  expect(response.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=86400");
});

it("If-None-Match一致時は304を返す", async () => {
  if (!revisionId) return;
  const url = `http://localhost/api/law-revisions/${revisionId}/document`;
  const first = await getDocument(
    new NextRequest(url),
    { params: { id: revisionId } },
  );
  const etag = first.headers.get("etag");
  expect(etag).toBeTruthy();
  const second = await getDocument(
    new NextRequest(url, { headers: { "If-None-Match": etag! } }),
    { params: { id: revisionId } },
  );
  expect(second.status).toBe(304);
});
```

- [ ] **Step 2: クライアントキャッシュの失敗テストを書く**

`web/src/__tests__/full-law-client.test.ts`:

```typescript
const documentFixture: FullLawDocument = {
  law: { id: "law-1", egovLawId: "325AC0000000201", name: "建築基準法", shortName: "建基法" },
  revision: { id: "rev-1", editionKey: "2026-01-01", sourceDate: "2026-01-01" },
  toc: [],
  nodes: [],
  linksBySource: {},
};

beforeEach(() => {
  clearFullLawDocumentCache();
});

it("同じrevisionは1回だけfetchする", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(documentFixture)));
  await fetchFullLawDocument("rev-1", fetcher);
  await fetchFullLawDocument("rev-1", fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("失敗結果はキャッシュせず再試行できる", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("error", { status: 500 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(documentFixture)));
  await expect(fetchFullLawDocument("rev-2", fetcher)).rejects.toThrow();
  await expect(fetchFullLawDocument("rev-2", fetcher)).resolves.toEqual(documentFixture);
});
```

- [ ] **Step 3: 未実装でテストが失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/full-law-client.test.ts src/__tests__/integration/full-law-document.test.ts`

Expected: FAIL — routeとclientが存在しない。

- [ ] **Step 4: 全文APIを実装する**

routeはdocumentを一度 `JSON.stringify()` し、その文字列のSHA-256をETagにする。

```typescript
const body = JSON.stringify(document);
const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
if (request.headers.get("if-none-match") === etag) {
  return new Response(null, { status: 304, headers: cacheHeaders(etag) });
}
return new Response(body, {
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
  },
});
```

存在しない版は404、DBエラーは500 JSONを返す。エラー応答は `Cache-Control: no-store` とする。

- [ ] **Step 5: fetch helperとhookを実装する**

```typescript
export async function fetchFullLawDocument(
  revisionId: string,
  fetcher: typeof fetch = fetch,
): Promise<FullLawDocument>;

export function clearFullLawDocumentCache(): void;

export function useFullLawDocument(revisionId: string): {
  status: "loading" | "ready" | "error";
  document: FullLawDocument | null;
  retry: () => void;
};
```

同時呼出しは `Map<string, Promise<FullLawDocument>>` で共有する。失敗時はPromiseをMapから削除する。hookはunmount後にstate更新しない。

- [ ] **Step 6: API・クライアントテストを通す**

Run: `cd web && npx vitest run src/__tests__/full-law-client.test.ts src/__tests__/integration/full-law-document.test.ts`

Expected: PASS。

- [ ] **Step 7: Task 3をコミットする**

```bash
git add web/src/app/api/law-revisions/[id]/document/route.ts web/src/lib/article/full-law-client.ts web/src/hooks/useFullLawDocument.ts web/src/__tests__/full-law-client.test.ts web/src/__tests__/integration/full-law-document.test.ts
git commit -m "feat(reader): expose cached full-law document API"
```

---

### Task 4: 全文ビューアと固定アンカー

**Files:**
- Create: `web/src/components/article/FullLawViewer.tsx`
- Modify: `web/src/components/article/ChapterArticleBlock.tsx`
- Modify: `web/src/lib/article/article-renderer.tsx`
- Modify: `web/src/components/article/ScrollUrlSync.tsx`
- Modify Test: `web/src/__tests__/full-law-document.test.ts`

**Interfaces:**
- Consumes: `FullLawDocument`、`buildFullLawBlocks()`、`fullLawAnchorId()`、`ScrollActiveArticleContext`
- Produces: `<FullLawViewer document targetArticleId />`、全ノードの固定DOM ID

- [ ] **Step 1: 対象ノード選択helperの失敗テストを書く**

`full-law-document.test.ts` に追加:

```typescript
it("子ノードを直接指定したとき、そのDOMセレクタを返す", () => {
  expect(fullLawTargetSelector("paragraph-1")).toBe("#law-node-paragraph-1");
});
```

- [ ] **Step 2: helper未実装で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/full-law-document.test.ts`

Expected: FAIL — `fullLawTargetSelector` が存在しない。

- [ ] **Step 3: 全法令ノードへ固定IDを付ける**

`full-law-document.ts` にselector helperを追加する。

```typescript
export function fullLawTargetSelector(articleId: string): string {
  return `#${fullLawAnchorId(articleId)}`;
}
```

`ArticleNode`、`DefinitionNode`、表ノードの最外要素に次を付与する。

```tsx
id={fullLawAnchorId(row.id)}
data-article-id={row.id}
```

`ChapterArticleBlock` のsentinelにも `id={fullLawAnchorId(articleRoot.id)}` を付けるが、同じArticle rootが本文nodeとして再出力される場合はDOM IDを重複させない。root見出し側を正本とし、本文側は子ノードだけを描画する現行構造を維持する。

- [ ] **Step 4: `FullLawViewer` を実装する**

```tsx
export default function FullLawViewer({
  document,
  targetArticleId,
}: {
  document: FullLawDocument;
  targetArticleId: string;
}) {
  const blocks = useMemo(
    () => buildFullLawBlocks(document.nodes, document.law.name),
    [document],
  );
  const links = useMemo(
    () => new Map(Object.entries(document.linksBySource)),
    [document.linksBySource],
  );
  useLayoutEffect(() => {
    window.document
      .querySelector<HTMLElement>(fullLawTargetSelector(targetArticleId))
      ?.scrollIntoView({ block: "start" });
  }, [targetArticleId]);
  return (
    <div data-full-law-ready="true">
      {blocks.map((block, index) =>
        block.kind === "heading" ? (
          <header id={fullLawAnchorId(block.node.id)} key={block.node.id}>
            {articleDisplayTitle(block.node)}
          </header>
        ) : (
          <ChapterArticleBlock
            key={block.article.root.id}
            articleRoot={block.article.root}
            descendantNodes={block.article.children}
            outgoingBySource={links}
            isFirst={index === 0}
          />
        ),
      )}
    </div>
  );
}
```

heading wrapperには `id={fullLawAnchorId(block.node.id)}` と `data-article-id={block.node.id}` を付ける。最外要素へ `data-full-law-ready="true"` を付ける。追加取得sentinel、前後読込ボタン、chapter cache、runtime link detectionを持たせない。

- [ ] **Step 5: URL同期からApplicability依存を除く**

`ScrollUrlSync` はアクティブArticle変更時に次だけを実行する。

```typescript
window.history.replaceState(
  window.history.state,
  "",
  `/articles/${encodeURIComponent(activeArticleId)}`,
);
```

- [ ] **Step 6: 単体テストを通す**

Run: `cd web && npx vitest run src/__tests__/full-law-document.test.ts src/__tests__/legal-display-format.test.ts src/__tests__/legal-number-format.test.ts`

Expected: PASS。

- [ ] **Step 7: Task 4をコミットする**

```bash
git add web/src/components/article/FullLawViewer.tsx web/src/components/article/ChapterArticleBlock.tsx web/src/lib/article/article-renderer.tsx web/src/components/article/ScrollUrlSync.tsx web/src/lib/article/full-law-document.ts web/src/__tests__/full-law-document.test.ts
git commit -m "feat(reader): render complete laws with stable anchors"
```

---

### Task 5: 目次移動と検索結果の読者向け簡素化

**Files:**
- Modify: `web/src/lib/article/full-law-document.ts`
- Modify: `web/src/__tests__/full-law-document.test.ts`
- Modify: `web/src/components/toc/TocTree.tsx`
- Modify: `web/src/components/search/SearchPracticePanel.tsx`
- Modify: `web/src/components/search/SearchPanel.tsx`

**Interfaces:**
- Consumes: `fullLawTargetSelector()`、既存横断検索API
- Produces: `readerArticleHref()`、同一DOMへ移動する目次、別タブで開く検索結果

- [ ] **Step 1: Reader URL helperの失敗テストを書く**

```typescript
it("reader article pathは適用時点queryを付けない", () => {
  expect(readerArticleHref("article-107")).toBe("/articles/article-107");
});
```

- [ ] **Step 2: helper未実装で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/full-law-document.test.ts`

Expected: FAIL — `readerArticleHref` が存在しない。

- [ ] **Step 3: 目次クリックを追加通信なしDOM移動へ変更する**

`full-law-document.ts` にReader URL helperを追加する。

```typescript
export function readerArticleHref(articleId: string): string {
  return `/articles/${encodeURIComponent(articleId)}`;
}
```

`TocTree.handleArticleClick()` は `fullLawTargetSelector(articleId)` で要素を取得し、次を実行する。

```typescript
target.scrollIntoView({ block: "start", behavior: "auto" });
window.history.replaceState(
  window.history.state,
  "",
  readerArticleHref(articleId),
);
```

同一全文内に対象がない場合だけ `router.push(readerArticleHref(articleId))` する。`setPendingTocScroll` とApplicability依存を外す。

- [ ] **Step 4: `SearchPracticePanel` を検索／論点索引だけへ縮小する**

`useProject`、`useApplicability`、history/check item state、status label/color、閲覧履歴・確認項目タブ、未確認 `/api/topics` fetchを削除する。

検索結果は次のリンクで開く。

```tsx
<a
  href={readerArticleHref(result.id)}
  target="_blank"
  rel="noopener noreferrer"
>
  <span>{result.lawShortName ?? result.lawName}</span>
  <strong>第{result.articleNumberNormalized}条</strong>
  {result.caption && <span>{result.caption}</span>}
  {result.textSnippet && (
    <span dangerouslySetInnerHTML={{ __html: result.textSnippet }} />
  )}
</a>
```

検索未実行時は「論点索引」と「確認済み論点の整備後に公開します」を表示する。検索結果のキーボード選択では `window.open(readerArticleHref(id), "_blank", "noopener,noreferrer")` を使う。

- [ ] **Step 5: SearchPanelの案件依存を除く**

検索API queryから `projectId` を送らず、横断検索だけを行う。検索イベントとキーボード移動は維持する。

- [ ] **Step 6: 型検査と関連テストを通す**

Run: `cd web && npx tsc --noEmit && npx vitest run src/__tests__/full-law-document.test.ts src/__tests__/integration/search-smoke.test.ts src/__tests__/toc-tree-display.test.ts`

Expected: PASS。

- [ ] **Step 7: Task 5をコミットする**

```bash
git add web/src/lib/article/full-law-document.ts web/src/__tests__/full-law-document.test.ts web/src/components/toc/TocTree.tsx web/src/components/search/SearchPracticePanel.tsx web/src/components/search/SearchPanel.tsx
git commit -m "refactor(reader): simplify toc and search navigation"
```

---

### Task 6: 全文目次・2列Reader shell・Article page縮小

**Files:**
- Create: `web/src/components/article/FullLawReader.tsx`
- Modify: `web/src/components/article/ArticleLayout.tsx`
- Modify: `web/src/app/articles/[id]/page.tsx`
- Modify: `web/src/components/layout/LeftPanel.tsx`
- Modify: `web/src/components/toc/TocPanel.tsx`

**Interfaces:**
- Consumes: `useFullLawDocument()`、`FullLawViewer`、`FullLawDocument.toc`
- Produces: `<FullLawReader lawRevisionId initialArticleId lawId breadcrumb />`、2列読者画面

- [ ] **Step 1: `TocPanel` を全文目次propsへ切り替える**

```typescript
interface TocPanelProps {
  nodes: TocNode[];
  currentArticleId: string | null;
  loading: boolean;
}
```

`/api/law-toc` fetchを削除する。法令選択用 `/api/laws` は維持するが、同じeditionのメモリ・sessionStorageキャッシュを使い、重複fetchを発生させない。法令選択時の遷移は `readerArticleHref(firstArticleId)` を使う。

- [ ] **Step 2: `ArticleLayout` を2列契約へ変更する**

```typescript
interface ArticleLayoutProps {
  breadcrumb: ReactNode;
  leftPanel: ReactNode;
  center: ReactNode;
}
```

`rightPanel`、`applicabilityBar`、`currentArticle`、`showRight`、`rightCollapsed`、実務ボタンを削除する。モバイルには「目次・検索」ボタンと左ドロワーだけを残す。

- [ ] **Step 3: `LeftPanel` の外枠を2タブだけにする**

タブ名を「目次」「検索」にし、`GlossaryList` を外す。propsは次に固定する。

```typescript
interface LeftPanelProps {
  toc: TocNode[];
  documentStatus: "loading" | "ready" | "error";
  currentArticleId: string | null;
}
```

pathname、Applicability、プロジェクトContextへ依存しない。

- [ ] **Step 4: `FullLawReader` を実装する**

```tsx
export default function FullLawReader(props: {
  lawRevisionId: string;
  initialArticleId: string;
  lawId: string;
  breadcrumb: ReactNode;
}) {
  return (
    <CurrentLawProvider lawId={props.lawId}>
      <FullLawReaderContent {...props} />
    </CurrentLawProvider>
  );
}

function FullLawReaderContent(props: {
  lawRevisionId: string;
  initialArticleId: string;
  lawId: string;
  breadcrumb: ReactNode;
}) {
  const state = useFullLawDocument(props.lawRevisionId);
  if (state.status === "loading") {
    return (
      <ArticleLayout
        breadcrumb={props.breadcrumb}
        leftPanel={<LeftPanel toc={[]} documentStatus="loading" currentArticleId={props.initialArticleId} />}
        center={<ReaderLoadingState />}
      />
    );
  }
  if (state.status === "error" || !state.document) {
    return (
      <ArticleLayout
        breadcrumb={props.breadcrumb}
        leftPanel={<LeftPanel toc={[]} documentStatus="error" currentArticleId={props.initialArticleId} />}
        center={<ReaderErrorState onRetry={state.retry} />}
      />
    );
  }
  return (
    <ScrollActiveArticleProvider linksByArticle={new Map()}>
      <FullLawReadyLayout {...props} document={state.document} />
    </ScrollActiveArticleProvider>
  );
}
```

`ReaderLoadingState` と `ReaderErrorState` を同じファイルの小さな表示専用関数として作る。`ReaderErrorState` は「全文を取得できません」「法令本文を表示できません」「再試行」の3要素を表示する。`FullLawReadyLayout` は `useScrollActiveArticle()` の `activeArticleId ?? initialArticleId` を `LeftPanel.currentArticleId` へ渡し、`ScrollUrlSync` と `FullLawViewer` を描画する。本文リンクは `FullLawViewer` が `document.linksBySource` を直接渡す。

- [ ] **Step 5: Article pageをServer metadata解決だけへ縮小する**

`page.tsx` は `getArticleWithTree(requestedArticleId)` と `getArticleBreadcrumb()` を並列実行し、未収録なら `notFound()`、成功時は `currentArticle.lawRevisionId`、`lawId`、breadcrumbを `FullLawReader` へ渡す。breadcrumb内の祖先リンクは `href={readerArticleHref(row.id)}` とし、Applicability queryを付けない。

`resolveApplicableArticle`、Applicability UI/Provider、activity/cooccurrence/default user、Annotation/UserHighlight/ContextMenu、runtime link detection、chapter window/aux、右パネル、InlineNoteEditorを読者pageから外す。legacy `anchor` / `asOf` queryは本文判定に使わない。

- [ ] **Step 6: 型検査と対象テストを通す**

Run: `cd web && npx tsc --noEmit && npx vitest run src/__tests__/article.test.ts src/__tests__/toc-tree-display.test.ts`

Expected: PASS。Applicabilityライブラリと専用テストは独立資産として残す。

- [ ] **Step 7: Task 6をコミットする**

```bash
git add web/src/components/article/FullLawReader.tsx web/src/components/article/ArticleLayout.tsx web/src/app/articles/[id]/page.tsx web/src/components/layout/LeftPanel.tsx web/src/components/toc/TocPanel.tsx
git commit -m "refactor(reader): switch the article page to full-law mode"
```

---

### Task 7: 全文E2E・通信予算・性能検証

**Files:**
- Create: `web/e2e/full-law-reader.spec.ts`
- Modify: `web/e2e/fixtures.ts`
- Modify: `web/e2e/scroll-mode.spec.ts`
- Modify: `web/e2e/readable-display.spec.ts`

**Interfaces:**
- Consumes: 稼働中の `npm run dev` または `npm run start`
- Produces: 全文表示、遠方移動、簡素化UI、通信0件を保証するブラウザ回帰テスト

- [ ] **Step 1: 旧段階読込テストを全文前提の失敗テストへ置換する**

`web/e2e/fixtures.ts` に建築基準法第107条を追加する。

```typescript
export const ARTICLE_107_ID =
  process.env.E2E_ARTICLE_107_ID ??
  "art_325ac0000000201_20260101_001866";
```

削除する旧期待:

- 初期ブロック数が11以下
- 下端到達でArticleが増加
- `chapter-aux` 遅延中も追加取得

新しい主要テスト:

```typescript
test("冒頭から法令末尾まで最初からDOMに存在する", async ({ page }) => {
  await page.goto(`/articles/${TEST_ARTICLE_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await expect(page.locator(`[data-scroll-article-id="${LAW_LAST_ARTICLE_ID}"]`)).toHaveCount(1);
});

test("遠方目次移動で追加通信しない", async ({ page }) => {
  let chapterRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/articles/chapter-window")) chapterRequests += 1;
  });
  await page.goto(`/articles/${TEST_ARTICLE_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await page.getByRole("tree").getByText(/第107条/).click();
  await expect(page.locator(`#law-node-${ARTICLE_107_ID}`)).toBeInViewport();
  expect(chapterRequests).toBe(0);
});
```

- [ ] **Step 2: 簡素化UIと不要通信のテストを書く**

`full-law-reader.spec.ts` で次を検証する。

```typescript
expect(await page.getByText("実務", { exact: true }).count()).toBe(0);
expect(await page.getByText("適用時点", { exact: false }).count()).toBe(0);
expect(await page.getByText("閲覧履歴", { exact: true }).count()).toBe(0);
expect(await page.getByText("確認項目", { exact: true }).count()).toBe(0);
```

request listenerで `/api/projects/active`、`/api/glossary`、`/api/recommendations`、`/api/notes`、`/api/user-highlights/batch`、`/api/topics`、`/api/articles/chapter-window`、`/api/articles/chapter-aux` が0件であることを確認する。

- [ ] **Step 3: 検索結果が新しいタブで開くテストを書く**

検索欄へ「排煙設備」を入力し、最初の結果クリックで `page.waitForEvent("popup")` が成立すること、元タブURLが変わらないことを確認する。

- [ ] **Step 4: ブラウザテストを実行する**

Run: `cd web && npx playwright test e2e/full-law-reader.spec.ts e2e/scroll-mode.spec.ts e2e/readable-display.spec.ts`

Expected: PASS。

- [ ] **Step 5: 本番ビルドで性能を計測する**

Run:

```bash
cd web
npm run build
npm run start
```

別ターミナルのPlaywright計測で、建築基準法・施行令・施行規則・労働安全衛生規則について次を記録する。

- 全文APIのencoded/decoded size
- 全文readyまでの時間
- DOM要素数
- 冒頭から末尾アンカーへの移動時間
- 移動中のnetwork request数

Expected: 全文読込後の移動100ms以内、追加通信0件、4法令すべてでブラウザ応答維持。

- [ ] **Step 6: Task 7をコミットする**

```bash
git add web/e2e/fixtures.ts web/e2e/full-law-reader.spec.ts web/e2e/scroll-mode.spec.ts web/e2e/readable-display.spec.ts
git commit -m "test(reader): verify full-law navigation performance"
```

---

### Task 8: 全回帰検証と引き継ぎ更新

**Files:**
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: Tasks 1〜7の完成状態
- Produces: 再現可能な検証結果と次タスク

- [ ] **Step 1: webの全単体・統合テストを実行する**

Run: `cd web && npm test`

Expected: 全件PASS。

- [ ] **Step 2: 型検査と本番ビルドを実行する**

Run: `cd web && npx tsc --noEmit && npm run build`

Expected: PASS。

- [ ] **Step 3: 独立資産 `src/` の回帰を確認する**

Run: `npm test`

Expected: 既存136件を含め全件PASS。

- [ ] **Step 4: 実ブラウザで受入確認する**

確認URL:

```text
http://localhost:3000/articles/art_325ac0000000201_20260101_000002
http://localhost:3000/articles/art_325ac0000000201_20260101_002605
```

目次から第107条、附則、別表へ移動し、追加通信がないこと、URL追従、本文表記、コピー動作を確認する。

- [ ] **Step 5: HANDOFFを更新する**

`docs/HANDOFF.md` に次を記録する。

- e-Gov型全文一括表示へ変更したこと
- 新しい全文APIと性能測定結果
- 読者画面から外した機能
- 既存分割取得コードは未削除であること
- 次タスクは確認済みReference Edge表示、論点索引、恒久URLの順であること

- [ ] **Step 6: 最終コミットを作成する**

```bash
git add docs/HANDOFF.md
git commit -m "docs: update handoff for full-law reader"
```

- [ ] **Step 7: 最終差分を確認する**

Run: `git status --short && git log --oneline -10`

Expected: 本計画で意図した変更だけがコミット済みで、開始前から存在した利用者変更はそのまま残っている。
