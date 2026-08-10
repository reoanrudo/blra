# 法令表・高密度レイアウト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** すべての法令表を横スクロールなしで本文幅に収め、列の役割に応じた冊子型の高密度レイアウトで表示する。

**Architecture:** `TableBlock`から列幅とセル揃えの判定を切り出し、表のグリッドとセル本文だけを入力にする純粋関数へ集約する。レンダラーはその結果で`colgroup`とセルクラスを描画し、CSSは罫線・余白・モバイル時の組版だけを担当する。

**Tech Stack:** Next.js、React、TypeScript、Tailwind CSS、Vitest、Playwright

## Global Constraints

- 横スクロールを導入しない。表は常に本文コンテナ幅の中で改行して表示する。
- DBのセル結合・罫線情報と法令原文は変更しない。
- 既存の`tableMetadata`による`colspan`・`rowspan`を必ず維持する。
- モバイルの最小文字サイズは12pxとする。
- 既存の居室種類表の結合補正を維持する。

---

### Task 1: 共通の表レイアウト判定を追加する

**Files:**
- Create: `web/src/lib/article/table-layout.ts`
- Create: `web/src/__tests__/table-layout.test.ts`
- Modify: `web/src/lib/article/table-column-width.ts`

**Interfaces:**
- Consumes: 行ごとのセル本文と`tableMetadata`から得た`colspan`。
- Produces: `deriveTableLayout(input): TableLayout`。`TableLayout.columns`は`kind: "symbol" | "numeric" | "body"`と`widthPercent: number`を持つ。

- [ ] **Step 1: 列幅・揃え判定の失敗テストを書く**

```ts
import { describe, expect, it } from "vitest";
import { deriveTableLayout } from "@/lib/article/table-layout";

describe("deriveTableLayout", () => {
  it("番号・本文・割合の3列では本文列へ最大の幅を配分する", () => {
    const layout = deriveTableLayout({
      rows: [["(1)", "居室の種類", "割合"], ["(2)", "幼稚園、小学校、中学校その他の教室", "1/5"]],
      spans: [[1, 1, 1], [1, 1, 1]],
    });
    expect(layout.columns.map((column) => column.kind)).toEqual(["symbol", "body", "numeric"]);
    expect(layout.columns[1].widthPercent).toBeGreaterThan(layout.columns[0].widthPercent);
    expect(layout.columns[1].widthPercent).toBeGreaterThan(layout.columns[2].widthPercent);
  });

  it("全列の幅比率は100になり、横スクロール用の余白を作らない", () => {
    const layout = deriveTableLayout({ rows: [["用途", "構造の説明", "数値", "備考"]], spans: [[1, 1, 1, 1]] });
    expect(layout.columns.reduce((sum, column) => sum + column.widthPercent, 0)).toBeCloseTo(100, 5);
    expect(layout.columns.every((column) => column.widthPercent > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd web && npm test -- --run src/__tests__/table-layout.test.ts`

Expected: FAIL with `Cannot find package '@/lib/article/table-layout'`.

- [ ] **Step 3: 最小のレイアウト判定を実装する**

```ts
export type TableColumnKind = "symbol" | "numeric" | "body";
export interface TableLayoutColumn { kind: TableColumnKind; widthPercent: number; }

export function deriveTableLayout(input: TableLayoutInput): TableLayout {
  const kinds = input.rows[0].map((_, index) => classifyColumn(input.rows.map((row) => row[index] ?? "")));
  const weights = kinds.map((kind, index) => kind === "symbol" ? 1 : kind === "numeric" ? 2 : bodyWeight(input.rows, index));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return { columns: kinds.map((kind, index) => ({ kind, widthPercent: weights[index] / total * 100 })) };
}
```

`classifyColumn`は、全セルが括弧付き番号または4文字以下なら`symbol`、数字・分数・単位付き数値が過半数なら`numeric`、それ以外を`body`とする。`bodyWeight`は最長本文の文字数の平方根を2以上16以下に丸める。

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd web && npm test -- --run src/__tests__/table-layout.test.ts src/__tests__/table-column-width.test.ts`

Expected: PASS。居室種類表の結合補正も維持される。

- [ ] **Step 5: コミットする**

```bash
git add web/src/lib/article/table-layout.ts web/src/__tests__/table-layout.test.ts web/src/lib/article/table-column-width.ts
git commit -m "feat(reader): derive balanced law table layout"
```

### Task 2: TableBlockと法令表CSSへ共通レイアウトを適用する

**Files:**
- Modify: `web/src/lib/article/article-renderer.tsx:1-28, 480-720`
- Modify: `web/src/app/globals.css:208-316`
- Test: `web/e2e/room-type-table-layout.spec.ts`

**Interfaces:**
- Consumes: `deriveTableLayout({ rows, spans })`の`columns`。
- Produces: 表の`<col>`幅と`law-table__cell--symbol`、`law-table__cell--numeric`、`law-table__cell--body`クラス。

- [ ] **Step 1: 表示要件の失敗テストを書く**

```ts
test("居室種類表は本文幅を超えず、本文列が番号列より広い", async ({ page }) => {
  await page.goto("/articles/art_325co0000000338_20260101_000225");
  const table = page.locator("table.law-table").first();
  const metrics = await table.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  const widths = await table.locator("col").evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
  expect(widths[1]).toBeGreaterThan(widths[0]);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts`

Expected: FAIL。現行の固定幅・セル余白では本文幅または列幅判定が条件を満たさない。

- [ ] **Step 3: レンダラーを共通判定へ置き換える**

```tsx
const layout = deriveTableLayout({
  rows: rows.map(({ cells }) => cells.map((cell) => cell.text ?? "")),
  spans: rows.map(({ cells }) => cells.map((cell) => safeParseCellStyle(cell.tableMetadata)?.colspan ?? 1)),
});

<colgroup>
  {layout.columns.map((column, index) => <col key={index} style={{ width: `${column.widthPercent}%` }} />)}
</colgroup>
```

既存の別表番号ごとの幅分岐を削除し、居室種類表の結合補正だけを`table-column-width.ts`に残す。セルクラスは`layout.columns[cellIdx]?.kind`を使い、本文・記号・数値の揃えを一貫させる。

- [ ] **Step 4: CSSを冊子型の組版へ更新する**

```css
.law-table-wrapper { margin-block: 0.875rem; overflow: clip; }
.law-table { border: 1px solid #4a4742; font-size: 0.8125rem; line-height: 1.55; }
.law-table__cell { padding: 0.35rem 0.45rem; overflow-wrap: anywhere; }
.law-table__header-row .law-table__cell { background: #f1efe9; font-weight: 600; border-bottom-color: #2f2d29; }
.law-table__cell--symbol { text-align: center; vertical-align: middle; }
.law-table__cell--numeric { text-align: right; vertical-align: middle; white-space: nowrap; }
.law-table__cell--body { text-align: left; vertical-align: top; }
@media (max-width: 640px) { .law-table__cell { font-size: 12px; padding: 0.3rem; } }
```

既存の9px縮小、空セルの幅1%、見出しの大きな字間指定を削除する。元XMLの罫線メタデータを生成する`borderClasses`は維持し、色だけを共通の墨色へそろえる。

- [ ] **Step 5: 操作テストが通ることを確認する**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts e2e/decimal-display.spec.ts`

Expected: PASS。結合セル、縦分数、表セルの表示変換が維持され、横方向のスクロール領域がない。

- [ ] **Step 6: コミットする**

```bash
git add web/src/lib/article/article-renderer.tsx web/src/app/globals.css web/e2e/room-type-table-layout.spec.ts
git commit -m "feat(reader): balance law table typography"
```

### Task 3: 代表的な長文表・多列表を回帰確認する

**Files:**
- Modify: `web/e2e/room-type-table-layout.spec.ts`
- Modify: `web/src/lib/article/table-layout.ts`

**Interfaces:**
- Consumes: `table.law-table`とセル種別クラス。
- Produces: 表が本文幅内に収まり、文字サイズと結合が保たれる回帰テスト。

- [ ] **Step 1: 複数列・長文表の失敗テストを書く**

```ts
for (const articleId of ["art_325co0000000338_20260101_000554", "art_325co0000000338_20260101_000945"]) {
  test(`${articleId} の全表は横方向にあふれない`, async ({ page }) => {
    await page.goto(`/articles/${articleId}`);
    const overflow = await page.locator("table.law-table").evaluateAll((tables) =>
      tables.some((table) => table.scrollWidth > table.clientWidth),
    );
    expect(overflow).toBe(false);
  });
}
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts`

Expected: FAIL。現行の表ごとの固定幅やセル余白が残っている場合に水平あふれを検出する。

- [ ] **Step 3: 実データに合わせて列役割の判定を最小限調整する**

`classifyColumn`の正規表現へ、縦分数、`㎡`、`m³/時間`、`%`、括弧付き号番号を追加する。本文列の下限を40%、記号列の上限を12%、数値列の上限を22%にし、4列以上の表で本文列が消えないようにする。

- [ ] **Step 4: 回帰テストが通ることを確認する**

Run: `cd web && npx playwright test e2e/room-type-table-layout.spec.ts`

Expected: PASS。居室種類表・換気回数表・長文表・多列表のすべてで横方向のあふれがない。

- [ ] **Step 5: 全体検証を実行する**

Run: `cd web && npm test && npm run typecheck && npx playwright test e2e/room-type-table-layout.spec.ts e2e/decimal-display.spec.ts e2e/readable-display.spec.ts e2e/readable-display-copy.spec.ts`

Expected: すべてPASS。

- [ ] **Step 6: コミットする**

```bash
git add web/e2e/room-type-table-layout.spec.ts web/src/lib/article/table-layout.ts
git commit -m "test(reader): cover balanced law tables"
```

## Self-review

- 横スクロール禁止はTask 2の`overflow: clip`とTask 3の`scrollWidth`検証でカバーする。
- 列幅、罫線、余白、揃え、モバイル最小12pxはTask 1とTask 2でカバーする。
- 既存のセル結合・原文不変更はTask 2のメタデータ保持と既存E2Eでカバーする。
- タスク間の公開インターフェースは`deriveTableLayout`に統一されている。
