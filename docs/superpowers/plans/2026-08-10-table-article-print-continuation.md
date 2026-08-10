# 表を含む条文印刷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 表セルから実行しても表・前後の条文・備考を含む条全体を、ページをまたいで印刷できるようにする。

**Architecture:** 既存の条単位の印刷範囲制御を維持する。表の先頭行を `thead` として描画し、印刷 CSS がヘッダーを繰り返し、行の途中分断とコンテナによる切り捨てを防ぐ。

**Tech Stack:** React 18、TypeScript、CSS、Playwright

## Global Constraints

- 表上の右クリックでも `🖨 この条を印刷` に統一する。
- 対象条の表、前後の条文、備考を同時に印刷する。
- 表が複数ページへ続く場合は、ヘッダーを繰り返し、内容を切り捨てない。
- 選択・リンク・ハイライトの右クリック優先順を変えない。

---

### Task 1: 表の印刷用構造とページ分割

**Files:**
- Modify: `web/src/lib/article/article-renderer.tsx:648-760`
- Modify: `web/src/app/globals.css:405-477`
- Modify: `web/e2e/print-law.spec.ts`

**Interfaces:**
- Consumes: `TableBlock({ tableNode, rows, anchorRows })`
- Produces: 先頭行を含む `<thead>` と、残りの行を含む `<tbody>`

- [ ] **Step 1: 失敗する E2E テストを書く**

`印刷時は選択した条だけを表とともに出力する` に、対象表の `thead` が表示され、印刷時の computed style が `table-header-group` であることを追加する。

```ts
const headerDisplay = await page.locator(`[data-print-article-id="${printTargetId}"] thead`).evaluate((element) => getComputedStyle(element).display);
expect(headerDisplay).toBe("table-header-group");
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx playwright test e2e/print-law.spec.ts --grep "選択した条だけ"`

Expected: FAIL because the rendered table has no `thead`.

- [ ] **Step 3: 最小実装を追加する**

`TableBlock` で `rows[0]` を `thead` に、残りを `tbody` に描画する。各行は既存のセル描画を共有するローカル関数へまとめ、属性と `rowspan`・`colspan` を変更しない。

`@media print` に以下の規則を追加する。

```css
.law-table-wrapper { overflow: visible !important; }
.law-table { break-inside: auto; }
.law-table thead { display: table-header-group; }
.law-table tr { break-inside: avoid; page-break-inside: avoid; }
```

- [ ] **Step 4: 印刷 E2E を通す**

Run: `npx playwright test e2e/print-law.spec.ts`

Expected: PASS with table, target article, and existing context-menu tests.

- [ ] **Step 5: 型検査・回帰テストを実行する**

Run: `npm run typecheck && npm test && npx playwright test e2e/print-law.spec.ts`

Expected: all commands exit with status 0.
