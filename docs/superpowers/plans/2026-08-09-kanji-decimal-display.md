# Kanji Decimal Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `三・〇` などの漢数字小数を、本文・表で `3.0` 形式に統一表示する。

**Architecture:** `formatLegalText` の走査前段で漢数字小数を単一の数値トークンとして認識する。DB原文は保持し、表示文字列と原文座標だけをトークンへ格納する。

**Tech Stack:** TypeScript、React、Next.js 14、Vitest、Playwright

## Global Constraints

- `三・〇 → 3.0`、`〇・〇〇三 → 0.003` と変換する。
- 本文と表の両方へ適用する。
- 数値でない中点は変更しない。
- DBおよび取込済み法令原文は変更しない。
- 変換後も原文座標を保持する。

---

### Task 1: 小数表示トークン

**Files:**
- Modify: `web/src/lib/article/legal-display-format.ts`
- Modify: `web/src/__tests__/legal-display-format.test.ts`
- Create: `web/e2e/decimal-display.spec.ts`

**Interfaces:**
- Consumes: `formatLegalText(text: string): LegalDisplayToken[]`
- Produces: 漢数字小数全体を表す `kind: "number"` の単一トークン

- [ ] **Step 1: 失敗する単体テストを書く**

```ts
expect(formatLegalText("三・〇")).toEqual([{
  sourceStart: 0,
  sourceEnd: 3,
  displayText: "3.0",
  kind: "number",
}]);
```

`〇・〇〇三 → 0.003` と `A・B → A・B` もリテラルで検証する。

- [ ] **Step 2: テストを実行して未変換による失敗を確認する**

Run: `npm test -- src/__tests__/legal-display-format.test.ts`

Expected: `三・〇` の表示が `3・〇` となりFAIL。

- [ ] **Step 3: 小数パターンの最小実装を追加する**

`formatLegalText` の各走査位置で `/^([〇零一二三四五六七八九])・([〇零一二三四五六七八九]+)/` を照合し、数字対応表で `3.0` 形式へ変換する。該当しない文字列は既存経路へ渡す。

- [ ] **Step 4: 実データのE2Eテストを追加する**

建築基準法施行令第20条の `三・〇` を含む段落を開き、表示文字列に `3.0` が含まれ `3・〇` が含まれないことを検証する。

- [ ] **Step 5: 単体テスト・型検査・E2Eを実行する**

Run: `npm test -- src/__tests__/legal-display-format.test.ts && npm run typecheck && npx playwright test e2e/decimal-display.spec.ts`

Expected: 全ケースPASS、型エラー0件。
