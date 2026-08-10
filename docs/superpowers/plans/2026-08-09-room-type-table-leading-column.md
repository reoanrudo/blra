# Room Type Table Cell Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建築基準法施行令第19条第3項の表を、35pxの番号列、正しい見出し位置、縦結合された割合セルで表示する。

**Architecture:** 対象表を法令名と安定ノードキーで限定し、純粋関数から列幅・横結合・縦結合・非表示セルの補正情報を返す。`TableBlock` は全行の最大列数で `colgroup` を作り、補正情報だけをHTMLの `colSpan`、`rowSpan`、セル省略へ反映する。

**Tech Stack:** TypeScript、React、Next.js 14、Vitest、Playwright

## Global Constraints

- 列0はPC・モバイルとも35px、割合列は70px固定とする。
- 「居室の種類」は番号列と説明列を横結合し、「割合」は分数列へ置く。
- 「居室の種類」の結合見出しは中央揃えにする。
- 割合は `1/5` を2行、`1/7` を4行、`1/10` を2行で縦結合する。
- 建築基準法施行令第19条第3項の最初の表だけへ適用する。
- DBおよび取込済み法令データは変更しない。

---

### Task 1: 対象表のセル補正情報

**Files:**
- Modify: `web/src/lib/article/table-column-width.ts`
- Modify: `web/src/__tests__/table-column-width.test.ts`

**Interfaces:**
- Consumes: `lawName: string`、`stableNodeKey: string | null`、`rows: { cells: { text: string | null }[] }[]`、`rowIndex: number`、`cellIndex: number`
- Produces: `preferredLeadingColumnWidthPx(input): number | null`、`preferredTrailingColumnWidthPx(input): number | null`、`supplementalRoomTypeTableCellLayout(input): { colSpan?: number; rowSpan?: number; hidden?: boolean; textAlign?: "center" } | null`

- [ ] **Step 1: 失敗する単体テストを書く**

対象表の列0が35px、割合列が70px、見出し先頭セルが `colSpan: 2` と `textAlign: "center"`、割合セルが順に `rowSpan: 2`、`rowSpan: 4`、`rowSpan: 2`、間の空白割合セルが `hidden: true` になることをリテラル値で検証する。別条文の表では補正が `null` になることも検証する。

- [ ] **Step 2: テストを実行し、110pxおよび未実装のセル補正により失敗することを確認する**

Run: `npm test -- src/__tests__/table-column-width.test.ts`

Expected: 35pxの期待に対して110pxが返り、`supplementalRoomTypeTableCellLayout` が未定義でFAIL。

- [ ] **Step 3: 最小の純粋関数を実装する**

対象表の見出しセルと割合列だけを補正する。割合セルの `rowSpan` は、値のあるセルから次の値のあるセルの直前までを数えて返す。

- [ ] **Step 4: 単体テストを再実行する**

Run: `npm test -- src/__tests__/table-column-width.test.ts`

Expected: 全ケースPASS。

### Task 2: TableBlockへの補正適用

**Files:**
- Modify: `web/src/lib/article/article-renderer.tsx`
- Test: `web/src/__tests__/table-column-width.test.ts`

**Interfaces:**
- Consumes: Task 1の `preferredLeadingColumnWidthPx`、`preferredTrailingColumnWidthPx`、`supplementalRoomTypeTableCellLayout`
- Produces: 3列の正しい `<colgroup>`、見出しの `colSpan`、割合の `rowSpan`

- [ ] **Step 1: 全行から最大列数を算出する**

各行のセルに設定済みの `colspan` を展開した列数を計算し、その最大値を `numCols` とする。

- [ ] **Step 2: セル補正を描画へ適用する**

`hidden` の割合セルは描画せず、見出しセルと値のある割合セルでは補正値を既存メタデータより優先して `colSpan`、`rowSpan` に設定する。

- [ ] **Step 3: 単体テストと型検査を実行する**

Run: `npm test -- src/__tests__/table-column-width.test.ts && npm run typecheck`

Expected: 全ケースPASS、型エラー0件。

- [ ] **Step 4: 実ブラウザでDOMを検証する**

第19条の対象表を開き、列0が35px、割合列が70px、見出しが `colspan="2"` かつ中央揃え、分数セルの `rowspan` が順に `2, 4, 2` で、空白割合セルが存在しないことを確認する。
