# 建築基準法施行令以下の表・印刷・数値表記 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建築基準法施行令以下の対象3法令について、別表準拠の表レイアウト、表を含む条文印刷、数値・単位の表示を一貫して正しくする。

**Architecture:** 表の対象判定は `usesLegacyLawTableLayout` に対象法令名を追加して一元管理し、既存の `TableBlock` と別表準拠CSSを再利用する。印刷は現在の `data-print-current` 属性と印刷用CSSを維持し、対象3法令の実ページで表・後続の号・表ヘッダーを検証する。数値・単位は通常本文の `formatLegalText` と原文レイアウト用セルの `formatRawTableCellText` の双方で整形し、DBの原文は変更しない。

**Tech Stack:** Next.js、React、TypeScript、Vitest、Playwright、Prisma/PostgreSQL

## Global Constraints

- 対象は「建築基準法施行令」「建築基準法施行規則」「建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令」の本文表・別表である。
- 建築基準法の別表を見た目の基準として維持し、対象外法令の表・印刷挙動を変えない。
- 背景色・強調色は使わず、表の罫線はヘッダーを含めて同一色・同一太さにする。
- 長いセルは折り返し、短い記号・番号だけは折り返さない。横スクロールを発生させない。
- 印刷では選択した条文に連続する表・号・備考を欠けなく出力し、複数ページの表ではヘッダーを繰り返す。
- 年号、法令番号、条・項・枝番、小数、単位は算用数字表示にする。号番号は漢数字を維持し、数値でない語は変換しない。
- 表示専用の変換とし、データベースの原文を更新しない。

---

## File Structure

- `web/src/lib/article/table-layout.ts` — 法令名と表ノードから別表準拠レイアウトの適用可否を返す純粋関数。
- `web/src/__tests__/table-layout.test.ts` — 対象3法令と対象外法令の判定を固定する単体テスト。
- `web/e2e/room-type-table-layout.spec.ts` — 実データの本文表・別表で、結合セルと狭い画面での横あふれを検証するブラウザテスト。
- `web/e2e/print-law.spec.ts` — 現在見ている条文を印刷する際に、表と後続の号が残ることを検証するブラウザテスト。
- `web/src/lib/article/raw-table-text-format.ts` — 原文レイアウトを保持する表セルの数値・単位表示変換。
- `web/src/__tests__/legal-display-format.test.ts` — 本文・定義・リンク内に共通で使う数値・単位表示変換の回帰テスト。
- `web/src/__tests__/raw-table-legal-number-format.test.ts` — 原文レイアウトを保持する表セルの数値・単位表示変換の回帰テスト。

## 実データの検証対象

- 施行令: 第19条 `art_325co0000000338_20260101_000225`、第20条の7 `art_325co0000000338_20260101_000370`、第82条 `art_325co0000000338_20260101_000945`。
- 施行規則: 本文表 `art_325m50004000040_20260101_000015`、別表 `art_325m50004000040_20260101_014122`。
- 指定建築基準適合判定資格者検定機関等に関する省令: 第16条 `art_411m50004000013_20260101_000143`、第17条 `art_411m50004000013_20260101_000323`。

### Task 1: 対象3法令を別表準拠レイアウトへ判定する

**Files:**
- Modify: `web/src/__tests__/table-layout.test.ts:60-69`
- Modify: `web/src/lib/article/table-layout.ts:22-31`

**Interfaces:**
- Consumes: `usesLegacyLawTableLayout({ lawName: string; stableNodeKey: string | null }): boolean`。
- Produces: 対象3法令の `table` / `appdx_table` ノードだけに `true` を返す不変の判定関数。

- [ ] **Step 1: 失敗する判定テストを書く**

`web/src/__tests__/table-layout.test.ts` の `it.each` に対象省令と非表ノードを追加する。

```ts
["建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令", "root/chapter:3@4/article:16@4/paragraph:1@1/table_struct:1@1/table:1@1", true],
["建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令", "root/chapter:3@4/article:16@4/paragraph:1@1", false],
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- src/__tests__/table-layout.test.ts`

Expected: 対象省令の表が `false` となり、追加した最初のケースだけ失敗する。

- [ ] **Step 3: 最小限の判定実装を加える**

`web/src/lib/article/table-layout.ts` の許可リストを定数化し、対象省令を追加する。`stableNodeKey` に `table` がなければ `false` を返す既存の安全条件は残す。

```ts
const LEGACY_TABLE_LAW_NAMES = new Set([
  "建築基準法",
  "建築基準法施行令",
  "建築基準法施行規則",
  "建築基準法に基づく指定建築基準適合判定資格者検定機関等に関する省令",
]);

return stableNodeKey?.includes("table") === true && LEGACY_TABLE_LAW_NAMES.has(lawName);
```

- [ ] **Step 4: 単体テストを通す**

Run: `npm test -- src/__tests__/table-layout.test.ts`

Expected: PASS。建築基準法・対象3法令は `true`、消防法施行令および非表ノードは `false`。

- [ ] **Step 5: コミットする**

```bash
git add web/src/lib/article/table-layout.ts web/src/__tests__/table-layout.test.ts
git commit -m "feat: cover all subordinate building regulations"
```

### Task 2: 対象3法令の全表を狭い画面でも別表準拠で表示する

**Files:**
- Modify: `web/e2e/room-type-table-layout.spec.ts:1-210`
- Modify: `web/src/app/globals.css:300-370`（Task 2 のブラウザテストで横あふれまたは罫線・背景の不整合が検出された場合のみ）
- Modify: `web/src/lib/article/article-renderer.tsx:359-470`（Task 2 のブラウザテストで対象表にクラスまたは列幅が反映されない場合のみ）

**Interfaces:**
- Consumes: Task 1 の `usesLegacyLawTableLayout` と既存の `.law-table--legacy` / `.law-table-wrapper--legacy`。
- Produces: 対象3法令のすべての表示表が `.law-table--legacy` を持ち、表示幅を超えないこと。

- [ ] **Step 1: 失敗する実ページのレイアウトテストを書く**

`room-type-table-layout.spec.ts` に、指定省令の第16条・第17条を対象にしたループを追加する。各ページで全 `.law-table` が旧レイアウトであり、表とそのラッパーが横にあふれないことを測る。

```ts
for (const [label, articleId] of [
  ["指定検定機関等省令第16条", "art_411m50004000013_20260101_000143"],
  ["指定検定機関等省令第17条", "art_411m50004000013_20260101_000323"],
] as const) {
  test(`${label} の表は別表準拠で横あふれを出さない`, async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto(`/articles/${articleId}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    const invalid = await page.locator(".law-table-wrapper").evaluateAll((wrappers) =>
      wrappers.flatMap((wrapper, index) => {
        const table = wrapper.querySelector("table.law-table");
        return !table || !table.classList.contains("law-table--legacy") ||
          wrapper.scrollWidth > wrapper.clientWidth || table.scrollWidth > table.clientWidth
          ? [index] : [];
      }),
    );
    expect(invalid).toEqual([]);
  });
}
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:e2e:browser -- room-type-table-layout.spec.ts`

Expected: Task 1 実装前は指定省令の表が `.law-table--legacy` を持たず失敗する。Task 1 の後に横あふれが残る場合は、その表の番号を出力して失敗する。

- [ ] **Step 3: 表示崩れだけを最小限修正する**

対象省令の判定追加後も失敗した場合だけ、`globals.css` または `article-renderer.tsx` を修正する。以下を維持する。

```css
.law-table--legacy .law-table__header-row .law-table__cell {
  background: transparent;
  border-bottom: 1px solid #a3a3a3;
  font-weight: inherit;
}

.law-table-wrapper--legacy { overflow: clip; }
.law-table--legacy .law-table__cell { overflow-wrap: break-word; word-break: break-word; }
.law-table--legacy .law-table__cell--nowrap { white-space: nowrap; }
```

列結合は `tableMetadata` の `colspan` / `rowspan` をそのまま描画し、固定幅や特定表だけの色・余白を追加しない。

- [ ] **Step 4: 全対象ページで通す**

Run: `npm run test:e2e:browser -- room-type-table-layout.spec.ts`

Expected: PASS。第19条・第20条の7・第82条、施行規則の本文表・別表、指定省令の第16条・第17条で、結合セル・透明ヘッダー・均一罫線・横あふれなしを確認できる。

- [ ] **Step 5: コミットする**

```bash
git add web/e2e/room-type-table-layout.spec.ts web/src/app/globals.css web/src/lib/article/article-renderer.tsx
git commit -m "test: verify subordinate regulation table layout"
```

### Task 3: 表を含む現在の条文を欠けなく印刷する

**Files:**
- Modify: `web/e2e/print-law.spec.ts:1-170`
- Modify: `web/src/app/globals.css:519-550`（印刷テストで表・後続の号・ヘッダーが欠ける場合のみ）
- Modify: `web/src/lib/article/current-article-print.ts:1-27`（右クリックの印刷対象が取れない場合のみ）

**Interfaces:**
- Consumes: `printCurrentArticle(articleId: string): boolean`、`data-print-current-article`、`data-print-current`。
- Produces: 選択した条文だけを印刷対象にしつつ、その子孫の表・号・備考をすべて表示する印刷スタイル。

- [ ] **Step 1: 対象3法令の印刷回帰テストを書く**

`print-law.spec.ts` に、施行令第82条、施行規則の本文表、指定省令第16条を対象とするループを追加する。印刷媒体へ切り替えた後、選択ブロック内のすべての表が見え、`thead` が `table-header-group`、対象外の条文が隠れることを検証する。

```ts
for (const [label, articleId] of [
  ["施行令第82条", "art_325co0000000338_20260101_000945"],
  ["施行規則本文表", "art_325m50004000040_20260101_000015"],
  ["指定検定機関等省令第16条", "art_411m50004000013_20260101_000143"],
] as const) {
  test(`${label} は表を含めて現在の条文だけを印刷する`, async ({ page }) => {
    await page.goto(`/articles/${articleId}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await page.evaluate((id) => {
      document.querySelector("[data-full-law-ready='true']")?.setAttribute("data-print-current-article", "true");
      document.querySelector(`[data-print-article-id="${id}"]`)?.setAttribute("data-print-current", "true");
    }, articleId);
    await page.emulateMedia({ media: "print" });
    const target = page.locator(`[data-print-article-id="${articleId}"]`);
    await expect(target.locator(".law-table-wrapper").first()).toBeVisible();
    await expect(target.locator("thead").first()).toHaveCSS("display", "table-header-group");
  });
}
```

- [ ] **Step 2: 失敗を確認する**

Run: `npm run test:e2e:browser -- print-law.spec.ts`

Expected: 既存の印刷範囲に表の子孫が含まれない場合、または `thead` の印刷指定が失われている場合に失敗する。施行令第82条では既存の第3号・第4号検証も必ず通す。

- [ ] **Step 3: 印刷用の表示範囲だけを修正する**

失敗した場合は、印刷媒体のCSSを次の仕様に合わせる。画面表示の `.law-table-wrapper--legacy { overflow: clip; }` は変更しない。

```css
@media print {
  .law-table-wrapper { overflow: visible !important; break-inside: auto !important; }
  .law-table { break-inside: auto; }
  .law-table thead { display: table-header-group; }
  .law-table tr { break-inside: avoid; page-break-inside: avoid; }
}
```

`data-print-current` を付ける要素は条文を包む `ChapterArticleBlock` のままとし、表単位で印刷対象を分断しない。

- [ ] **Step 4: 印刷テストを通す**

Run: `npm run test:e2e:browser -- print-law.spec.ts`

Expected: PASS。対象3法令の表が印刷対象に含まれ、施行令第82条では表の後の第3号・第4号も表示され、印刷終了後は画面媒体へ戻る。

- [ ] **Step 5: コミットする**

```bash
git add web/e2e/print-law.spec.ts web/src/app/globals.css web/src/lib/article/current-article-print.ts
git commit -m "test: cover subordinate regulation table printing"
```

### Task 4: 本文・表セルの数値と単位を同じ規則で表示する

**Files:**
- Modify: `web/src/__tests__/legal-display-format.test.ts:80-175`
- Modify: `web/src/__tests__/raw-table-legal-number-format.test.ts:1-35`
- Modify: `web/src/lib/article/raw-table-text-format.ts:6-68`（追加テストが失敗した場合のみ）
- Modify: `web/src/lib/article/legal-unit-dictionary.ts`（本文変換の追加テストが失敗した場合のみ）

**Interfaces:**
- Consumes: `formatLegalText(text: string): LegalDisplayToken[]` と `formatRawTableCellText(text: string): string`。
- Produces: 本文と原文レイアウト表セルの双方で、表示文字列だけをアラビア数字・短縮単位にする純粋関数。

- [ ] **Step 1: 表示経路ごとの失敗する数値テストを書く**

通常本文は `formatLegalText`、原文レイアウト表セルは `formatRawTableCellText` に、以下の期待値を追加する。

```ts
expect(formatLegalText("〇・一ミリグラム及び二・一メートル")
  .map((token) => token.displayText).join(""))
  .toBe("0.1mg及び2.1m");
expect(formatLegalText("有効換気量は立方メートル毎時で表す。")
  .map((token) => token.displayText).join(""))
  .toBe("有効換気量はm³/時間で表す。");
expect(formatLegalText("昭和二十五年法律第二百二号第二条第六号")
  .map((token) => token.displayText).join(""))
  .toBe("昭和25年法律第202号第2条第六号");

expect(formatRawTableCellText("〇・一ミリグラム及び二・一メートル"))
  .toBe("0.1mg及び2.1m");
expect(formatRawTableCellText("立方メートル毎時"))
  .toBe("m³/時間");
expect(formatRawTableCellText("昭和二十五年法律第二百二号第二条第六号"))
  .toBe("昭和25年法律第202号第2条第六号");
expect(formatRawTableCellText("百貨店第一号"))
  .toBe("百貨店第一号");
```

通常本文では既存形式に合わせて、`formatLegalText(source).map((token) => token.displayText).join("")` を比較する。

- [ ] **Step 2: 失敗を確認する**

Run: `npm test -- src/__tests__/legal-display-format.test.ts src/__tests__/raw-table-legal-number-format.test.ts`

Expected: 本文側の既存変換は通るケースがある。原文レイアウト表セルの `ミリグラム` と `立方メートル毎時` は未対応なら失敗し、実装対象を明確にする。

- [ ] **Step 3: 表セルの変換を本文規則へそろえる**

`raw-table-text-format.ts` の単位置換を、長い単位を先に処理する順序で追加する。`立方メートル毎時` は `m³/時間` とし、単独の `立方メートル` より先に置換する。

```ts
for (const [from, to] of [
  ["立方メートル毎時", "m³/時間"],
  ["ミリグラム", "mg"],
  ["平方メートル", "m²"],
  ["立方メートル", "m³"],
  ["ミリメートル", "mm"],
  ["メートル", "m"],
] as const) {
  result = result.replaceAll(from, to);
}
```

この後にある数値と単位を連結する正規表現へ `mg` を加える。`第六号` と `百貨店` の除外規則は変更しない。本文側で失敗した場合だけ、同じ長い単位優先の語を `legal-unit-dictionary.ts` に追加する。

- [ ] **Step 4: 数値テストを通す**

Run: `npm test -- src/__tests__/legal-display-format.test.ts src/__tests__/raw-table-legal-number-format.test.ts src/__tests__/legal-number-format.test.ts`

Expected: PASS。小数・法令番号・条項・単位は算用数字表示になり、`第六号` と `百貨店` は原文どおり残る。

- [ ] **Step 5: コミットする**

```bash
git add web/src/lib/article/raw-table-text-format.ts web/src/lib/article/legal-unit-dictionary.ts web/src/__tests__/legal-display-format.test.ts web/src/__tests__/raw-table-legal-number-format.test.ts
git commit -m "fix: normalize raw table units and numbers"
```

### Task 5: 対象3法令を通しで検証する

**Files:**
- Modify: なし（失敗時は失敗した Task の該当ファイルだけを修正する）

**Interfaces:**
- Consumes: Tasks 1-4 の判定、表示、印刷の実装とテスト。
- Produces: 対象3法令の表・印刷・数値表示が既存の法令リーダー機能と共存することの検証結果。

- [ ] **Step 1: 単体テスト全件を実行する**

Run: `npm test`

Expected: PASS。表構造、表示用数値変換、リンク・ハイライトに関する既存テストを含めて全件通過する。

- [ ] **Step 2: 表と印刷のブラウザテストを実行する**

Run: `npm run test:e2e:browser -- room-type-table-layout.spec.ts print-law.spec.ts`

Expected: PASS。対象3法令の本文表・別表、狭い画面、表を含む条文印刷、第82条の後続号を確認する。

- [ ] **Step 3: 型検査を実行する**

Run: `npm run typecheck`

Expected: PASS。TypeScriptエラーなし。

- [ ] **Step 4: 変更範囲を確認してコミットする**

Run: `git status --short`

Expected: この計画で変更したファイルだけを確認し、既存の利用者変更はステージしない。

```bash
git add web/src/lib/article/table-layout.ts web/src/lib/article/raw-table-text-format.ts web/src/lib/article/legal-unit-dictionary.ts web/src/__tests__/table-layout.test.ts web/src/__tests__/legal-display-format.test.ts web/src/__tests__/raw-table-legal-number-format.test.ts web/e2e/room-type-table-layout.spec.ts web/e2e/print-law.spec.ts web/src/app/globals.css web/src/lib/article/article-renderer.tsx web/src/lib/article/current-article-print.ts
git commit -m "test: verify subordinate regulation display scope"
```

変更のないファイルは `git add` の対象から外す。前タスクで既にコミット済みのファイルを再コミットしない。
