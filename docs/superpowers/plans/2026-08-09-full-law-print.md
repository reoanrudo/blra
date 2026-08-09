# 法令全文印刷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 法令リーダーで表示中の法令を、ブラウザ標準の印刷画面から全文印刷できるようにする。

**Architecture:** 読み込み完了後の法令ヘッダーへ小さなクライアントボタンを追加し、押下時に `window.print()` を呼ぶ。印刷媒体用CSSでは法令リーダーの操作UIを非表示にし、画面内スクロールと用紙風装飾を解除して、すでにDOMへ描画済みの法令全文をA4縦へ流す。

**Tech Stack:** Next.js 14、React 18、TypeScript、Tailwind CSS、Playwright

## Global Constraints

- 印刷対象は、表示中の法令名、章・節・款、全条文、附則、別表とする。
- 画面で開いている位置にかかわらず、法令の先頭から末尾までを印刷する。
- ブラウザ標準の `window.print()` を使用し、独自の印刷設定画面や専用ページを作らない。
- 用紙はA4縦向きを基準とする。
- パンくず、目次・検索、操作ボタン、e-Govリンク、操作用通知は印刷しない。
- 条文範囲指定、アプリによるPDF生成、独自ページ番号、印刷設定保存は追加しない。
- 法令本文データの取得方法、URL、検索、関連表示の処理は変更しない。
- 作業開始前から存在する未コミット変更を、印刷機能のコミットへ混ぜない。

---

## File Structure

- Create: `web/src/components/article/PrintLawButton.tsx`
  - ブラウザ印刷を起動するボタンだけを担当する。
- Create: `web/e2e/print-law.spec.ts`
  - 印刷ボタン、全文範囲、印刷媒体での表示切替をブラウザで検証する。
- Modify: `web/src/components/article/FullLawReader.tsx`
  - 読み込み完了後の法令ヘッダーへボタンを配置し、操作用通知を印刷対象外にする。
- Modify: `web/src/components/article/ArticleLayout.tsx`
  - 印刷時に隠す画面UIと、スクロール解除対象の外枠へ識別属性を付ける。
- Modify: `web/src/app/globals.css`
  - A4縦、操作UI非表示、スクロール解除、白地化を印刷媒体だけへ適用する。

### Task 1: ブラウザ標準の印刷ボタン

**Files:**
- Create: `web/src/components/article/PrintLawButton.tsx`
- Create: `web/e2e/print-law.spec.ts`
- Modify: `web/src/components/article/FullLawReader.tsx:3-9,143-159`

**Interfaces:**
- Consumes: ブラウザ標準の `window.print(): void`
- Produces: `PrintLawButton(): JSX.Element`、アクセシブル名が「印刷」のボタン

- [ ] **Step 1: 印刷ボタンの失敗するブラウザテストを書く**

`web/e2e/print-law.spec.ts` を次の内容で作成する。

```ts
import { LAW_LAST_ARTICLE_ID, TEST_ARTICLE_ID, expect, test } from "./fixtures";

test.describe("法令全文印刷", () => {
  test("印刷ボタンからブラウザ標準の印刷を呼び出す", async ({ page }) => {
    await page.addInitScript(() => {
      const state = window as Window & { __printCalled?: boolean };
      state.__printCalled = false;
      window.print = () => {
        state.__printCalled = true;
      };
    });

    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

    await page.getByRole("button", { name: "印刷", exact: true }).click();

    const printCalled = await page.evaluate(
      () => (window as Window & { __printCalled?: boolean }).__printCalled,
    );
    expect(printCalled).toBe(true);
  });
});
```

`LAW_LAST_ARTICLE_ID` はTask 2で使うため、最初からimportしておく。

- [ ] **Step 2: テストを実行し、ボタンがないため失敗することを確認する**

Run（`web/`で実行）:

```bash
npm run test:e2e:browser -- e2e/print-law.spec.ts --grep "印刷ボタン"
```

Expected: FAIL。`getByRole("button", { name: "印刷" })` が見つからない。

- [ ] **Step 3: 最小の印刷ボタンを作る**

`web/src/components/article/PrintLawButton.tsx` を次の内容で作成する。

```tsx
"use client";

export default function PrintLawButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 hover:bg-neutral-50"
    >
      印刷
    </button>
  );
}
```

- [ ] **Step 4: 読み込み完了後の法令ヘッダーへボタンを配置する**

`web/src/components/article/FullLawReader.tsx` へimportを追加する。

```tsx
import PrintLawButton from "@/components/article/PrintLawButton";
```

`LawRunningHeader` の右側を次の操作グループへ置き換える。法令名は変更しない。

```tsx
<div
  data-print-hidden="true"
  className="law-running-header__actions flex items-center gap-3"
>
  <PrintLawButton />
  <a
    href={`https://laws.e-gov.go.jp/law/${encodeURIComponent(egovLawId)}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[11px] font-bold text-[#9d1f58] hover:underline"
  >
    e-Govで改正・施行情報を確認
  </a>
</div>
```

ボタンは `LawRunningHeader` 内だけに置くため、読み込み中・取得失敗・履歴表示には出さない。

- [ ] **Step 5: 印刷呼び出しのテストを再実行する**

Run（`web/`で実行）:

```bash
npm run test:e2e:browser -- e2e/print-law.spec.ts --grep "印刷ボタン"
```

Expected: PASS。

- [ ] **Step 6: 型検査を実行する**

Run（`web/`で実行）:

```bash
npm run typecheck
```

Expected: PASS、TypeScriptエラー0件。

- [ ] **Step 7: 印刷ボタンだけをコミットする**

`FullLawReader.tsx` には作業開始前から別の未コミット変更があるため、ファイル全体を一括ステージしない。印刷ボタンのimportと操作グループだけを対話的に選び、ステージ内容を確認する。

```bash
git add web/src/components/article/PrintLawButton.tsx web/e2e/print-law.spec.ts
git add -p web/src/components/article/FullLawReader.tsx
git diff --cached --check
git diff --cached -- web/src/components/article/FullLawReader.tsx
git commit -m "feat: 法令全文の印刷ボタンを追加"
```

Expected: ステージ差分に、施行日・確認状態の既存変更や印刷と無関係な差分が含まれていない。

### Task 2: 法令全文をA4へ流す印刷表示

**Files:**
- Modify: `web/e2e/print-law.spec.ts`
- Modify: `web/src/components/article/ArticleLayout.tsx:29-87`
- Modify: `web/src/components/article/FullLawReader.tsx:110-119,148-158,162-174`
- Modify: `web/src/app/globals.css:395`

**Interfaces:**
- Consumes: `data-print-hidden="true"`、`data-article-layout="true"`、`data-article-layout-content="true"`、既存の `data-scroll-container="article-main"`
- Produces: `@media print` で操作UIを隠し、法令本文の高さとオーバーフロー制限を解除する印刷レイアウト

- [ ] **Step 1: 印刷表示の失敗するブラウザテストを書く**

`web/e2e/print-law.spec.ts` の `test.describe` 内へ次のテストを追加する。

```ts
test("印刷時は操作UIを隠し法令の末尾まで出力対象にする", async ({ page }) => {
  await page.goto(`/articles/${TEST_ARTICLE_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();

  await page.emulateMedia({ media: "print" });

  await expect(page.locator('nav[data-print-hidden="true"]')).toBeHidden();
  await expect(page.locator(".law-running-header__actions")).toBeHidden();
  await expect(page.locator(".law-running-header__law")).toBeVisible();
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await expect(
    page.locator(`[data-scroll-article-id="${LAW_LAST_ARTICLE_ID}"]`),
  ).toBeAttached();

  const overflowY = await page
    .locator('main[data-scroll-container="article-main"]')
    .evaluate((element) => getComputedStyle(element).overflowY);
  expect(overflowY).toBe("visible");

  const lawPageStyle = await page.locator(".law-page").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(lawPageStyle).toEqual({
    backgroundColor: "rgb(255, 255, 255)",
    borderTopWidth: "0px",
    boxShadow: "none",
  });
});
```

- [ ] **Step 2: テストを実行し、印刷用レイアウトがないため失敗することを確認する**

Run（`web/`で実行）:

```bash
npm run test:e2e:browser -- e2e/print-law.spec.ts --grep "印刷時"
```

Expected: FAIL。`nav[data-print-hidden]` がない、または本文領域の `overflowY` が `auto` のまま。

- [ ] **Step 3: レイアウトへ印刷用の識別属性を追加する**

`web/src/components/article/ArticleLayout.tsx` の最上位レイアウトへ属性を追加する。

```tsx
<div
  data-article-layout="true"
  className="flex h-screen flex-col bg-neutral-100 text-neutral-950"
>
```

パンくずの `<nav>`、モバイル用の背景ボタン、モバイル用 `<aside>`、デスクトップ用 `<aside>` へ、それぞれ次の属性を追加する。

```tsx
data-print-hidden="true"
```

本文と左右欄を包む要素へ属性を追加する。

```tsx
<div
  data-article-layout-content="true"
  className="flex min-h-0 flex-1 overflow-hidden"
>
```

既存の `main[data-scroll-container="article-main"]` はそのまま使う。

- [ ] **Step 4: 法令ヘッダー以外の操作用通知を印刷対象外にする**

`web/src/components/article/FullLawReader.tsx` の更新通知を印刷対象外の要素で包む。

```tsx
<div data-print-hidden="true">
  <LawChangeNoticeBanner
    notice={document.revision.changeNotice}
    egovLawId={document.law.egovLawId}
  />
</div>
```

`ConfirmedRelationsPartialError` の `<section>` へ属性を追加する。

```tsx
<section
  data-print-hidden="true"
  role="status"
  className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
>
```

- [ ] **Step 5: A4縦の印刷媒体CSSを追加する**

`web/src/app/globals.css` の末尾へ、既存の `@layer components` の外側として次を追加する。

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 14mm;
  }

  html,
  body {
    background: #fff !important;
  }

  [data-print-hidden="true"] {
    display: none !important;
  }

  [data-article-layout="true"] {
    display: block !important;
    height: auto !important;
    background: #fff !important;
  }

  [data-article-layout-content="true"] {
    display: block !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  main[data-scroll-container="article-main"] {
    display: block !important;
    overflow: visible !important;
    background: #fff !important;
    padding: 0 !important;
  }

  .law-page {
    max-width: none;
    margin: 0;
    border: 0;
    box-shadow: none;
    padding: 0;
    background: #fff;
    container-type: normal;
  }

  .law-running-header {
    grid-template-columns: 1fr;
  }

  .law-running-header__law {
    color: #171717;
  }

  .law-body {
    overflow: visible;
  }

  .law-body a,
  .law-article-caption a {
    color: inherit;
    text-decoration: none;
  }
}
```

- [ ] **Step 6: 印刷表示テストを再実行する**

Run（`web/`で実行）:

```bash
npm run test:e2e:browser -- e2e/print-law.spec.ts
```

Expected: 2 tests PASS。

- [ ] **Step 7: 既存の全文リーダーテストと型検査を実行する**

Run（`web/`で実行）:

```bash
npm run test:e2e:browser -- e2e/full-law-reader.spec.ts e2e/print-law.spec.ts
npm run typecheck
```

Expected: 対象PlaywrightテストがすべてPASSし、TypeScriptエラー0件。

- [ ] **Step 8: 差分の形式とスコープを確認する**

Run（リポジトリルートで実行）:

```bash
git diff --check
git diff -- web/src/components/article/ArticleLayout.tsx web/src/app/globals.css web/e2e/print-law.spec.ts
```

Expected: 空白エラーなし。印刷と無関係な機能追加なし。

- [ ] **Step 9: 印刷表示だけをコミットする**

`FullLawReader.tsx` はファイル全体を一括ステージしない。更新通知を包む `data-print-hidden` と、関連取得エラーへ追加した `data-print-hidden` の差分だけを対話的に選び、施行日・確認状態の既存変更を除外する。

```bash
git add web/src/components/article/ArticleLayout.tsx web/src/app/globals.css web/e2e/print-law.spec.ts
git add -p web/src/components/article/FullLawReader.tsx
git diff --cached --check
git diff --cached
git commit -m "feat: 法令全文の印刷表示を整える"
```

Expected: コミット対象は印刷用属性、印刷媒体CSS、印刷テストだけ。
