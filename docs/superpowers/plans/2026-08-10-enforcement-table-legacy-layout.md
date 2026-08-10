# Enforcement Table Legacy Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建築基準法施行令・建築基準法施行規則の全表を、建築基準法別表と同じ法令集形式へ統一する。

**Architecture:** 法令名と安定キーから旧表レイアウトの適用可否を決める純粋関数を用意する。`TableBlock` はその結果で既存の旧列幅計算・セル組版と現行の自動レイアウトを切り替える。

**Tech Stack:** Next.js、React、TypeScript、Tailwind CSS、Vitest、Playwright。

## Global Constraints

- 対象は「建築基準法施行令」「建築基準法施行規則」の本文表・別表。
- 建築基準法の別表は旧レイアウトを維持し、対象外法令の表は変えない。
- 背景色・強調色は使わず、罫線は同じ色・1pxにする。
- データ、結合セル、表示用数値変換、印刷制御は変更しない。
- 横スクロールは出さない。

---

### Task 1: 旧レイアウトの対象判定を追加する

**Files:**

- Modify: `web/src/lib/article/table-layout.ts`
- Test: `web/src/__tests__/table-layout.test.ts`

**Interfaces:**

- Produces: `usesLegacyLawTableLayout(input: { lawName: string; stableNodeKey: string | null }): boolean`
- Consumed by: `TableBlock` in `web/src/lib/article/article-renderer.tsx`

- [ ] **Step 1: 失敗する判定テストを書く**

```ts
it.each([
  ["建築基準法", "root/appdx_table:128@128", true],
  ["建築基準法施行令", "root/article:19@1/table:1@1", true],
  ["建築基準法施行規則", "root/appdx_table:1@1", true],
  ["消防法施行令", "root/appdx_table:1@1", false],
])("%s の表は旧レイアウトか", (lawName, stableNodeKey, expected) => {
  expect(usesLegacyLawTableLayout({ lawName, stableNodeKey })).toBe(expected);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/table-layout.test.ts`

Expected: `usesLegacyLawTableLayout is not exported` でFAIL。

- [ ] **Step 3: 最小の判定関数を実装する**

```ts
export function usesLegacyLawTableLayout({ lawName, stableNodeKey }: {
  lawName: string;
  stableNodeKey: string | null;
}): boolean {
  if (!stableNodeKey?.includes("table")) return false;
  return ["建築基準法", "建築基準法施行令", "建築基準法施行規則"].includes(lawName);
}
```

- [ ] **Step 4: 判定テストを通す**

Run: `cd web && npx vitest run src/__tests__/table-layout.test.ts`

Expected: PASS。

- [ ] **Step 5: コミットする**

Run: `git add web/src/lib/article/table-layout.ts web/src/__tests__/table-layout.test.ts && git commit -m "feat: classify legacy law table layouts"`

### Task 2: 対象表に旧レイアウトを適用する

**Files:**

- Modify: `web/src/lib/article/article-renderer.tsx`
- Modify: `web/src/app/globals.css`
- Test: `web/e2e/room-type-table-layout.spec.ts`

**Interfaces:**

- Consumes: `usesLegacyLawTableLayout({ lawName, stableNodeKey })`
- Produces: `law-table--legacy` と `law-table-wrapper--legacy` クラス
- Preserves: `supplementalRoomTypeTableCellLayout`、`formatRawTableCellText`、印刷用 `thead` 制御

- [ ] **Step 1: 施行令の表に旧レイアウトクラスがないことを検出するE2Eテストを書く**

```ts
test("建築基準法施行令の表は別表と同じ旧レイアウトを使う", async ({ page }) => {
  await page.goto("/articles/art_325co0000000338_20260101_000019");
  await expect(page.locator(".law-table--legacy").first()).toBeVisible();
  await expect(page.locator(".law-table--legacy .law-table__header-row").first())
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts`

Expected: 施行令の表に `law-table--legacy` がなくFAIL。

- [ ] **Step 3: `TableBlock` を判定関数で切り替える**

```ts
const useLegacyLawTableLayout = usesLegacyLawTableLayout({
  lawName: tableNode.lawName,
  stableNodeKey: tableNode.stableNodeKey,
});
const useBalancedLayout = !useLegacyLawTableLayout;
```

旧レイアウトでは既存の旧列幅計算、先頭2行のヘッダー構造、セルの空欄幅・折り返し・記号判定を使う。対象外では現在の均等配分を使う。

- [ ] **Step 4: 背景なし・均一罫線の旧表CSSを適用する**

```css
.law-table--legacy .law-table__header-row .law-table__cell {
  background: transparent;
  border-bottom: 1px solid #a3a3a3;
  font-weight: inherit;
}
```

セルは13px、640px以下は11px、480px以下は9pxとし、`word-break: break-word`、`white-space: nowrap`、空セルの最小余白を建築基準法別表と同じ値にする。

- [ ] **Step 5: E2Eと型検査を通す**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts && npm run typecheck`

Expected: PASS。

- [ ] **Step 6: コミットする**

Run: `git add web/src/lib/article/article-renderer.tsx web/src/app/globals.css web/e2e/room-type-table-layout.spec.ts && git commit -m "feat: align enforcement tables with appendix layout"`

### Task 3: 対象範囲の回帰を確認する

**Files:**

- Test: `web/src/__tests__/table-layout.test.ts`
- Test: `web/e2e/room-type-table-layout.spec.ts`

**Interfaces:**

- Consumes: `usesLegacyLawTableLayout` と `TableBlock` のクラス出力。
- Verifies: 対象2法令、建築基準法別表、対象外法令が分離されること。

- [ ] **Step 1: 対象外法令の回帰テストを追加する**

```ts
expect(usesLegacyLawTableLayout({
  lawName: "消防法施行令",
  stableNodeKey: "root/appdx_table:1@1/table:1@1",
})).toBe(false);
```

- [ ] **Step 2: 単体・全体テストと型検査を通す**

Run: `cd web && npx vitest run src/__tests__/table-layout.test.ts && npm test && npm run typecheck`

Expected: PASS。

- [ ] **Step 3: コミットする**

Run: `git add web/src/__tests__/table-layout.test.ts web/e2e/room-type-table-layout.spec.ts && git commit -m "test: cover enforcement table layout scope"`

## Self-Review

- Spec coverage: 対象法令、背景色なし、均一罫線、旧列幅、横スクロールなし、対象外保護をTask 1〜3で扱う。
- Placeholder scan: 未決事項・TODOはない。
- Type consistency: 判定関数はTask 1で定義し、Task 2・3で同じ入力・戻り値を使用する。
