# 条文右クリック印刷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本文の右クリックメニューから、選択した条だけを表・備考とともに印刷できるようにする。

**Architecture:** `ChapterArticleBlock` の条ラッパーに印刷対象属性を追加する。右クリック時にそのラッパーをコンテキストへ渡し、DOM ヘルパーが一時属性を付与して印刷を呼ぶ。印刷 CSS は全文コンテナ直下の条を絞り込む。

**Tech Stack:** Next.js 14、React 18、TypeScript、Tailwind CSS、Vitest、Playwright

## Global Constraints

- テキスト選択、既存ハイライト、条文リンクの右クリックメニューの優先順を変更しない。
- `🖨 この条を印刷` は印刷可能な条ブロック上の通常メニューだけに表示する。
- 印刷対象は段落・号・表セルでなく条全体とし、印刷終了後に一時 DOM 属性を残さない。
- ヘッダーの `印刷` ボタンは撤去し、全文印刷を既定のアプリ操作にしない。

---

### Task 1: 条印刷の DOM ヘルパー

**Files:**
- Create: `web/src/lib/article/current-article-print.ts`
- Create: `web/src/__tests__/current-article-print.test.ts`

**Interfaces:**
- Produces: `findPrintableArticleId(target: Element): string | null`
- Produces: `printCurrentArticle(articleId: string): boolean`
- Consumes: `data-print-article-id` と `data-full-law-ready="true"`

- [ ] **Step 1: 失敗するユニットテストを書く**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findPrintableArticleId, printCurrentArticle } from "@/lib/article/current-article-print";

describe("current article print", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div data-full-law-ready="true"><section data-print-article-id="article-1"><span id="cell">表セル</span></section><section data-print-article-id="article-2">第二条</section></div>`;
    vi.stubGlobal("print", vi.fn());
  });
  it("子要素から条ルートのIDを取得する", () => {
    expect(findPrintableArticleId(document.getElementById("cell")!)).toBe("article-1");
  });
  it("印刷後に対象属性を復元する", () => {
    expect(printCurrentArticle("article-1")).toBe(true);
    expect(window.print).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-full-law-ready]")?.hasAttribute("data-print-current-article")).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- src/__tests__/current-article-print.test.ts`

Expected: FAIL with module-not-found for `@/lib/article/current-article-print`.

- [ ] **Step 3: 最小限のヘルパーを実装する**

```ts
export function findPrintableArticleId(target: Element): string | null {
  return target.closest<HTMLElement>("[data-print-article-id]")?.dataset.printArticleId ?? null;
}

export function printCurrentArticle(articleId: string): boolean {
  const article = document.querySelector<HTMLElement>(`[data-print-article-id="${CSS.escape(articleId)}"]`);
  const viewer = article?.closest<HTMLElement>("[data-full-law-ready='true']");
  if (!article || !viewer) return false;
  viewer.setAttribute("data-print-current-article", "true");
  article.setAttribute("data-print-current", "true");
  try { window.print(); return true; } finally {
    article.removeAttribute("data-print-current");
    viewer.removeAttribute("data-print-current-article");
  }
}
```

- [ ] **Step 4: ユニットテストを通す**

Run: `npm test -- src/__tests__/current-article-print.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: コミットする**

```bash
git add web/src/lib/article/current-article-print.ts web/src/__tests__/current-article-print.test.ts
git commit -m "feat(reader): add current article print helper"
```

### Task 2: 右クリックメニューへ条印刷を追加する

**Files:**
- Modify: `web/src/components/article/ChapterArticleBlock.tsx:274-282`
- Modify: `web/src/components/system/context-menu/types.ts:13-14`
- Modify: `web/src/components/system/context-menu/useContextMenu.ts:80-96, 500-508, 568-593`
- Modify: `web/src/components/system/context-menu/menus/MainMenu.tsx:54-120`
- Modify: `web/src/components/article/FullLawReader.tsx:8, 156-160`
- Modify: `web/e2e/print-law.spec.ts`

**Interfaces:**
- Consumes: `findPrintableArticleId(target: Element): string | null` and `printCurrentArticle(articleId: string): boolean`
- Produces: article context `{ kind: "article"; articleId: string; printableArticleId: string | null }`
- Produces: `handlePrintCurrentArticle(): void` on `UseContextMenuReturn`

- [ ] **Step 1: 右クリック印刷の E2E テストを先に書く**

`web/e2e/print-law.spec.ts` の最初のテストを次の流れへ置き換え、選択・既存ハイライトのメニューには印刷項目が表示されないことも検証する。

```ts
await page.locator(`[data-print-article-id="${TEST_ARTICLE_ID}"]`).click({ button: "right" });
await expect(page.getByRole("menuitem", { name: "🖨 この条を印刷" })).toBeVisible();
await page.getByRole("menuitem", { name: "🖨 この条を印刷" }).click();
expect(await page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
```

- [ ] **Step 2: E2E テストが失敗することを確認する**

Run: `npx playwright test e2e/print-law.spec.ts --grep "右クリック"`

Expected: FAIL because `data-print-article-id` and the menu item do not exist.

- [ ] **Step 3: 条ルート属性とメニュー操作を実装する**

`ChapterArticleBlock` の最外側要素へ `data-print-article-id={articleRoot.id}` を追加する。通常の条文コンテキストだけに `findPrintableArticleId(target)` の結果を保存する。

`MainMenu` は `printableArticleId` がある場合だけ先頭に次の項目を表示し、残りのメニュー番号を 1 ずらす。

```tsx
<MenuButton index={0} focused={clampedIndex === 0} onClick={menu.handlePrintCurrentArticle}>
  🖨 この条を印刷
</MenuButton>
```

`handlePrintCurrentArticle` は `printCurrentArticle(printableArticleId)` を呼んで閉じる。`menuItemCount` とメニューの高さ見積りを新しい項目数に合わせる。`FullLawReader` から `PrintLawButton` の import と表示を撤去する。

- [ ] **Step 4: E2E テストを通す**

Run: `npx playwright test e2e/print-law.spec.ts`

Expected: PASS with context-menu print, print stylesheet, and highlight compatibility tests.

- [ ] **Step 5: コミットする**

```bash
git add web/src/components/article/ChapterArticleBlock.tsx web/src/components/system/context-menu/types.ts web/src/components/system/context-menu/useContextMenu.ts web/src/components/system/context-menu/menus/MainMenu.tsx web/src/components/article/FullLawReader.tsx web/e2e/print-law.spec.ts
git commit -m "feat(reader): print current article from context menu"
```

### Task 3: 印刷媒体で対象条だけを出力する

**Files:**
- Modify: `web/src/app/globals.css:405-466`
- Modify: `web/e2e/print-law.spec.ts`

**Interfaces:**
- Consumes: `data-full-law-ready="true" data-print-current-article="true"` and `data-print-current="true"`
- Produces: 印刷媒体で選択条だけを表示する CSS ルール

- [ ] **Step 1: 印刷範囲の E2E テストを先に書く**

対象条に `data-print-current`、全文コンテナに `data-print-current-article` を付与して印刷媒体を有効にし、対象条とその表が見え、別の条と章見出しが隠れることを検証する。属性を外して通常媒体に戻した後、すべての条が再び見えることも検証する。

- [ ] **Step 2: E2E テストが失敗することを確認する**

Run: `npx playwright test e2e/print-law.spec.ts --grep "対象の条だけ"`

Expected: FAIL because print CSS does not limit the displayed direct children.

- [ ] **Step 3: 印刷用 CSS を追加する**

`@media print` 内へ次を追加する。既存の `data-print-hidden` と全文印刷用スタイルは残す。

```css
[data-full-law-ready="true"][data-print-current-article="true"] > :not([data-print-current="true"]) { display: none !important; }
[data-full-law-ready="true"][data-print-current-article="true"] > [data-print-current="true"] { display: block !important; }
[data-full-law-ready="true"][data-print-current-article="true"] .chapter-scroll-separator { display: none !important; }
```

- [ ] **Step 4: E2E テストを通す**

Run: `npx playwright test e2e/print-law.spec.ts`

Expected: PASS with selected article, table, note, and existing print UI checks.

- [ ] **Step 5: 型検査と回帰テストを実行する**

Run: `npm run typecheck && npm test && npx playwright test e2e/print-law.spec.ts`

Expected: all commands exit with status 0.

- [ ] **Step 6: コミットする**

```bash
git add web/src/app/globals.css web/e2e/print-law.spec.ts
git commit -m "feat(reader): scope print output to selected article"
```
