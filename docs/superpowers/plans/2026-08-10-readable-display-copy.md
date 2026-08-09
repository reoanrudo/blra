# 法令本文の小数・時間単位・コピー表示統合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 漢数字の複数桁小数と確認済み時間単位を横書き法令集の表記へ変換し、通常コピーで画面表示どおりの文字列を取得できるようにする。

**Architecture:** 公式原文はDBとDOM属性へ保持したまま、`formatLegalText`と固定単位辞書だけで表示トークンを生成する。コピー時の公式原文差替えを廃止してブラウザーの表示選択文字列を使い、原文座標へ戻す`getSelectionContext`はハイライト・注釈専用として維持する。

**Tech Stack:** Next.js 14、React 18、TypeScript、Vitest、Playwright

## Global Constraints

- DB保存値およびAPIレスポンスの公式原文は変更しない。
- `data-original-text`、`data-source-start`、`data-source-end`を維持する。
- 万・億は既存規則どおり文字を残す。
- 小数部の先頭・末尾のゼロを保持する。
- 数値ではない中点と未知の複合単位は原文を維持する。
- 時間当たりの単位は実データで確認済みの固定辞書だけを変換する。
- 新しい依存パッケージを追加しない。
- 作業ツリーには無関係な変更があるため、各コミットでは当該タスクのファイルだけを明示的にステージする。

---

## File Map

- `web/src/lib/article/legal-display-format.ts`: 原文を小数・数値・単位・分数の表示トークンへ変換する。
- `web/src/lib/article/legal-unit-dictionary.ts`: 安全に記号化できる単位表現と直前数量ガードを管理する。
- `web/src/components/article/OfficialTextCopyBoundary.tsx`: 全文ビュー内のコピー境界を提供する。公式原文への差替えは行わない。
- `web/src/components/article/ArticleTextWrapper.tsx`: 旧本文ラッパーでも通常コピーを妨げない。
- `web/src/__tests__/legal-display-format.test.ts`: 小数・単位を含む表示トークンの回帰テスト。
- `web/src/__tests__/legal-unit-dictionary.test.ts`: 固定単位辞書の一致・優先順位・安全策のテスト。
- `web/e2e/readable-display.spec.ts`: 既存コピー方針を「表示文字列コピー」へ更新するブラウザーテスト。
- `web/e2e/readable-display-copy.spec.ts`: 対象条文で小数・時間単位・分数の表示とコピーを検証する。

---

### Task 1: 複数桁の漢数字小数を一つの表示トークンへ変換する

**Files:**
- Modify: `web/src/__tests__/legal-display-format.test.ts`
- Modify: `web/src/lib/article/legal-display-format.ts`
- Modify: `web/src/lib/article/legal-unit-dictionary.ts`

**Interfaces:**
- Consumes: `formatKanjiQuantity(text: string): string`、`findUnitMatch(text: string, position: number)`
- Produces: `formatLegalText(text: string): LegalDisplayToken[]`が`二十・五`などを一つの`number`トークンとして返す。

- [ ] **Step 1: 複数桁小数と小数直後の単位について失敗テストを書く**

`web/src/__tests__/legal-display-format.test.ts`の小数変換`describe`へ追加する。

```ts
it.each([
  ["二十・五パーセント以上", "20.5%以上"],
  ["百二十・五", "120.5"],
  ["三・〇パーセント", "3.0%"],
  ["〇・〇〇五ミリグラム", "0.005mg"],
  ["一万二千三百四十五・六七", "1万2,345.67"],
])("複数桁を含む漢数字小数 %s を %s へ変換する", (source, expected) => {
  expect(formatLegalText(source).map((token) => token.displayText).join(""))
    .toBe(expected);
});

it("複数桁小数を原文範囲付きの単一数値トークンにする", () => {
  expect(formatLegalText("二十・五")).toEqual([
    {
      sourceStart: 0,
      sourceEnd: 4,
      displayText: "20.5",
      kind: "number",
    },
  ]);
});
```

- [ ] **Step 2: テストを実行して小数認識不足による失敗を確認する**

Run:

```bash
cd web
npm test -- src/__tests__/legal-display-format.test.ts
```

Expected: `二十・五パーセント`が`20・5%`、`三・〇パーセント`が`3.0パーセント`となり、新規ケースがFAILする。

- [ ] **Step 3: 小数の整数部と小数部を別規則で変換する最小実装を書く**

`web/src/lib/article/legal-display-format.ts`の小数定数・処理を次の形へ更新する。

```ts
const KANJI_DECIMAL_AT_START =
  /^([零〇一二三四五六七八九十百千万億]+)・([零〇一二三四五六七八九]+)/;

const KANJI_DECIMAL_DIGITS: Readonly<Record<string, string>> = Object.freeze({
  零: "0", 〇: "0", 一: "1", 二: "2", 三: "3",
  四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9",
});

function mapKanjiDecimalDigits(text: string): string {
  return [...text].map((char) => KANJI_DECIMAL_DIGITS[char] ?? char).join("");
}

function formatKanjiDecimal(integerPart: string, decimalPart: string): string {
  const integerDisplay = /[十百千万億]/.test(integerPart)
    ? formatKanjiQuantity(integerPart)
    : mapKanjiDecimalDigits(integerPart);
  return `${integerDisplay}.${mapKanjiDecimalDigits(decimalPart)}`;
}
```

走査ループの小数分岐は、既存の`kanjiToArabic(sourceText)`ではなく次を使う。

```ts
const decimalMatch = text.slice(pos).match(KANJI_DECIMAL_AT_START);
if (decimalMatch) {
  const sourceText = decimalMatch[0];
  tokens.push({
    sourceStart: pos,
    sourceEnd: pos + sourceText.length,
    displayText: formatKanjiDecimal(decimalMatch[1]!, decimalMatch[2]!),
    kind: "number",
  });
  pos += sourceText.length;
  continue;
}
```

`web/src/lib/article/legal-unit-dictionary.ts`の直前数量ガードへ`零`と`〇`を追加する。

```ts
return /[0-9,.．，]/.test(prevChar) ||
  /[零〇一二三四五六七八九十百千万億]/.test(prevChar);
```

- [ ] **Step 4: 小数テストを再実行して成功を確認する**

Run:

```bash
cd web
npm test -- src/__tests__/legal-display-format.test.ts
```

Expected: 小数、既存分数、除外判定、原文座標を含む同ファイルの全テストがPASSする。

- [ ] **Step 5: Task 1のファイルだけをコミットする**

```bash
git add -- web/src/__tests__/legal-display-format.test.ts \
  web/src/lib/article/legal-display-format.ts \
  web/src/lib/article/legal-unit-dictionary.ts
git commit -m "fix(reader): 複数桁の漢数字小数を表示変換"
```

---

### Task 2: 確認済みの時間当たり単位を固定辞書で変換する

**Files:**
- Modify: `web/src/__tests__/legal-unit-dictionary.test.ts`
- Modify: `web/src/__tests__/legal-display-format.test.ts`
- Modify: `web/src/lib/article/legal-unit-dictionary.ts`

**Interfaces:**
- Consumes: `UNIT_ENTRIES: readonly UnitEntry[]`、`findUnitMatch(text, position)`
- Produces: 確認済み時間単位を一つの`unit`トークンへ変換する辞書エントリ。

- [ ] **Step 1: 時間単位の辞書一致について失敗テストを書く**

`web/src/__tests__/legal-unit-dictionary.test.ts`の`findUnitMatch`へ追加する。

```ts
it.each([
  ["立方メートル毎時", "m³/時間"],
  ["立方メートル毎分", "m³/分"],
  ["リットル毎分", "L/分"],
  ["メートル毎秒毎秒", "m/秒²"],
  ["メートル毎秒", "m/秒"],
  ["ミリグレイ毎時", "mGy/時間"],
  ["マイクログレイ毎時", "μGy/時間"],
  ["マイクロシーベルト毎時", "μSv/時間"],
])("時間単位 %s を %s に変換する", (source, expected) => {
  expect(findUnitMatch(source, 0)).toMatchObject({
    from: source,
    to: expected,
    start: 0,
    end: source.length,
  });
});

it("辞書にない毎日単位は推測変換しない", () => {
  expect(findUnitMatch("立方メートル毎日", 0)).toBeNull();
});
```

`web/src/__tests__/legal-display-format.test.ts`の単位変換へ追加する。

```ts
it("文章中の立方メートル毎時を一つの単位トークンへ変換する", () => {
  const source = "有効換気量(立方メートル毎時で表した量とする。)";
  const tokens = formatLegalText(source);
  expect(tokens.map((token) => token.displayText).join(""))
    .toBe("有効換気量(m³/時間で表した量とする。)");
  expect(tokens.find((token) => token.displayText === "m³/時間"))
    .toMatchObject({ kind: "unit" });
});

it("時間語が先にある文章は語順を変えない", () => {
  expect(formatLegalText("毎時十四立方メートル").map((token) => token.displayText).join(""))
    .toBe("毎時14m³");
});
```

- [ ] **Step 2: 辞書と表示テストを実行して未登録による失敗を確認する**

Run:

```bash
cd web
npm test -- src/__tests__/legal-unit-dictionary.test.ts src/__tests__/legal-display-format.test.ts
```

Expected: 新しい時間単位ケースが`null`または原文表示となってFAILする。

- [ ] **Step 3: 固定辞書へ長い時間単位から明示的に追加する**

`web/src/lib/article/legal-unit-dictionary.ts`の複合単位群へ追加する。配列は後段で長さ降順にソートされるが、読みやすさのため長いものから記述する。

```ts
{ from: "マイクロシーベルト毎時", to: "μSv/時間", isCompound: true },
{ from: "メートル毎秒毎秒", to: "m/秒²", isCompound: true },
{ from: "マイクログレイ毎時", to: "μGy/時間", isCompound: true },
{ from: "立方メートル毎時", to: "m³/時間", isCompound: true },
{ from: "立方メートル毎分", to: "m³/分", isCompound: true },
{ from: "ミリグレイ毎時", to: "mGy/時間", isCompound: true },
{ from: "リットル毎分", to: "L/分", isCompound: true },
{ from: "メートル毎秒", to: "m/秒", isCompound: true },
```

`UnitEntry.isCompound`のコメントを、漢数字始まりだけでなく「固定辞書で安全性を確認した複合表現」を含む説明へ更新する。

- [ ] **Step 4: 辞書・表示テストを再実行して成功を確認する**

Run:

```bash
cd web
npm test -- src/__tests__/legal-unit-dictionary.test.ts src/__tests__/legal-display-format.test.ts
```

Expected: 長さ降順、既存単位の誤変換防止、新規時間単位を含む全テストがPASSする。

- [ ] **Step 5: Task 2のファイルだけをコミットする**

```bash
git add -- web/src/__tests__/legal-unit-dictionary.test.ts \
  web/src/__tests__/legal-display-format.test.ts \
  web/src/lib/article/legal-unit-dictionary.ts
git commit -m "feat(reader): 時間当たり単位を記号化"
```

---

### Task 3: 通常コピーを画面表示文字列へ切り替える

**Files:**
- Modify: `web/e2e/readable-display.spec.ts`
- Modify: `web/src/components/article/OfficialTextCopyBoundary.tsx`
- Modify: `web/src/components/article/ArticleTextWrapper.tsx`

**Interfaces:**
- Consumes: ブラウザー標準`Selection`と`copy`動作。
- Produces: `Cmd+C` / `Ctrl+C`でDOM上の表示文字列をプレーンテキストとして取得する動作。

- [ ] **Step 1: 既存コピーE2Eを表示文字列期待へ変更する**

`web/e2e/readable-display.spec.ts`のコピーケースを次の内容へ更新する。

```ts
test("表示変換した文字をコピーすると画面表示を得る", async ({ page }) => {
  await page.goto(`/articles/${TEST_ARTICLE_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const token = page.locator('[data-source-kind="number"]').first();
  await expect(token).toBeVisible();
  const expectedDisplay = await token.textContent();
  expect(expectedDisplay).toBeTruthy();

  await token.evaluate((element) => {
    const textNode = element.firstChild;
    if (!textNode) throw new Error("copy target has no text node");
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  const sourceStart = Number(await token.getAttribute("data-source-start"));
  const sourceEnd = Number(await token.getAttribute("data-source-end"));
  const lawNode = token.locator("xpath=ancestor::*[@data-original-text][1]");
  const originalText = await lawNode.getAttribute("data-original-text");
  expect(originalText).toBeTruthy();
  expect(expectedDisplay).not.toBe(originalText!.slice(sourceStart, sourceEnd));

  await page.keyboard.press("Meta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expectedDisplay);

  await expect(token).toHaveAttribute("data-source-start");
  await expect(token).toHaveAttribute("data-source-end");
});
```

- [ ] **Step 2: コピーE2Eを実行して公式原文が返る失敗を確認する**

Run:

```bash
cd web
npx playwright test e2e/readable-display.spec.ts --grep "画面表示"
```

Expected: copied textが`expectedDisplay`ではなく公式原文となってFAILする。

- [ ] **Step 3: 公式原文へ差し替えるcopyハンドラーを削除する**

`web/src/components/article/OfficialTextCopyBoundary.tsx`を表示境界だけのコンポーネントへ簡素化する。

```tsx
import type { ReactNode } from "react";

export default function OfficialTextCopyBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return <div data-official-copy-boundary="true">{children}</div>;
}
```

`web/src/components/article/ArticleTextWrapper.tsx`では次を削除する。

- `getSelectionContext`のimport
- `onCopy`関数
- `el.addEventListener("copy", onCopy)`
- cleanup内の`el.removeEventListener("copy", onCopy)`

`mousedown`による条文プレビュー処理は変更しない。

- [ ] **Step 4: コピーE2Eを再実行して表示文字列がコピーされることを確認する**

Run:

```bash
cd web
npx playwright test e2e/readable-display.spec.ts --grep "画面表示"
```

Expected: 1 test PASS。コピー値が表示トークンの`textContent`と一致し、原文座標属性も残る。

- [ ] **Step 5: Task 3のファイルだけをコミットする**

```bash
git add -- web/e2e/readable-display.spec.ts \
  web/src/components/article/OfficialTextCopyBoundary.tsx \
  web/src/components/article/ArticleTextWrapper.tsx
git commit -m "fix(reader): コピーを画面表示文字列に統一"
```

---

### Task 4: 実条文で小数・時間単位・分数の表示とコピーを検証する

**Files:**
- Create: `web/e2e/readable-display-copy.spec.ts`

**Interfaces:**
- Consumes: Task 1の小数トークン、Task 2の時間単位トークン、Task 3の表示コピー。
- Produces: 建築基準法施行令の実データを使った表示・コピー回帰テスト。

- [ ] **Step 1: 実条文E2Eを追加する**

`web/e2e/readable-display-copy.spec.ts`を作成する。

```ts
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const LAW_ENTRY_ID = "art_325co0000000338_20260101_000341";
const DECIMAL_NODE_ID = "art_325co0000000338_20260101_000357";
const RATE_UNIT_NODE_ID = "art_325co0000000338_20260101_000325";

async function copyRenderedRange(
  page: Page,
  first: Locator,
  last: Locator,
): Promise<string> {
  const firstHandle = await first.elementHandle();
  const lastHandle = await last.elementHandle();
  if (!firstHandle || !lastHandle) throw new Error("copy range target is missing");

  await page.evaluate(([firstElement, lastElement]) => {
    const range = document.createRange();
    range.setStartBefore(firstElement);
    range.setEndAfter(lastElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [firstHandle, lastHandle]);

  await page.keyboard.press("Meta+c");
  return page.evaluate(() => navigator.clipboard.readText());
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/articles/${LAW_ENTRY_ID}`);
  await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("複数桁小数と時間単位を表示する", async ({ page }) => {
  const decimalNode = page.locator(`[data-article-id="${DECIMAL_NODE_ID}"]`);
  const rateNode = page.locator(`[data-article-id="${RATE_UNIT_NODE_ID}"]`);
  await expect(decimalNode).toContainText("20.5%以上");
  await expect(decimalNode).not.toContainText("20・5%");
  await expect(rateNode).toContainText("m³/時間で表した量");
  await expect(rateNode).not.toContainText("立方メートル毎時");
});

test("小数・時間単位・縦分数を画面表示どおりコピーする", async ({ page }) => {
  const decimalNode = page.locator(`[data-article-id="${DECIMAL_NODE_ID}"]`);
  const decimal = decimalNode.locator('[data-source-kind="number"]')
    .filter({ hasText: /^20\.5$/ });
  const percent = decimalNode.locator('[data-source-kind="unit"]')
    .filter({ hasText: /^%$/ });
  expect(await copyRenderedRange(page, decimal, percent)).toBe("20.5%");

  const rateUnit = page.locator(`[data-article-id="${RATE_UNIT_NODE_ID}"]`)
    .locator('[data-source-kind="unit"]')
    .filter({ hasText: /^m³\/時間$/ });
  expect(await copyRenderedRange(page, rateUnit, rateUnit)).toBe("m³/時間");

  const fraction = page.locator(".law-fraction").first();
  expect(await copyRenderedRange(page, fraction, fraction))
    .toBe(await fraction.textContent());
});
```

- [ ] **Step 2: 実条文E2Eを実行する**

Run:

```bash
cd web
npx playwright test e2e/readable-display-copy.spec.ts
```

Expected: 2 tests PASS。

- [ ] **Step 3: 対象単体テスト・型検査・コピー関連E2Eをまとめて実行する**

Run:

```bash
cd web
npm test -- src/__tests__/legal-display-format.test.ts src/__tests__/legal-unit-dictionary.test.ts
npm run typecheck
npx playwright test \
  e2e/decimal-display.spec.ts \
  e2e/readable-display.spec.ts \
  e2e/readable-display-copy.spec.ts
```

Expected: 対象単体テスト、TypeScript型検査、対象ブラウザーテストがすべてPASSする。

- [ ] **Step 4: 全テストと差分検査を実行する**

Run:

```bash
cd web
npm test
git -C .. diff --check -- \
  web/src/lib/article/legal-display-format.ts \
  web/src/lib/article/legal-unit-dictionary.ts \
  web/src/components/article/OfficialTextCopyBoundary.tsx \
  web/src/components/article/ArticleTextWrapper.tsx \
  web/src/__tests__/legal-display-format.test.ts \
  web/src/__tests__/legal-unit-dictionary.test.ts \
  web/e2e/readable-display.spec.ts \
  web/e2e/readable-display-copy.spec.ts
```

Expected: 今回の対象テストと差分検査はPASSする。全テストで既知のDB状態依存統合テストだけが失敗する場合は、件数とテスト名を記録して今回の変更と切り分ける。

- [ ] **Step 5: Task 4のE2Eだけをコミットする**

```bash
git add -- web/e2e/readable-display-copy.spec.ts
git commit -m "test(reader): 表示変換とコピーの実条文回帰を追加"
```

---

## Completion Checklist

- [ ] `二十・五パーセント`が`20.5%`になる。
- [ ] `三・〇パーセント`が`3.0%`になる。
- [ ] 小数部のゼロと原文座標が保持される。
- [ ] 承認済み時間単位が固定辞書どおり変換される。
- [ ] 未知の単位と数値ではない中点が原文維持される。
- [ ] 通常コピーで表示どおりの小数・単位・分数を取得できる。
- [ ] ハイライト・注釈用の原文座標処理が維持される。
- [ ] 対象単体テスト、型検査、対象E2Eが成功する。
- [ ] 全テストの既知失敗が今回の変更と無関係であることを記録する。
