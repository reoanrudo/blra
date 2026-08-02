# Applicability Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/` の法令リーダーへ、5種類の適用アンカー、明示的な `asOf` URL、適用日による条文版解決、常時表示の適用時点バーを追加する。

**Architecture:** URL の `anchor`・`asOf`・`project` を適用文脈の正本とし、純粋関数で検証・正規化する。サーバー側で現在の条文の `lawId` と `stableNodeKey` を起点に該当 `LawRevision` を一意解決し、クライアント側は Context を介してすべての条文内遷移へ適用文脈を引き継ぐ。適用範囲外や版の曖昧性では最寄り版を推測せず、本文の代わりに影響と次の操作を示す。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、PostgreSQL、Tailwind CSS v3、Vitest 4

**Status (2026-07-31): COMPLETE.** 以下のチェックリストは実施時の手順記録として未変更で残す。最終検証は Web 311テスト、バックエンド136テスト、TypeScript、本番ビルド、法令集DB完全性、実ブラウザ操作を通過した。

## Global Constraints

- `docs/design-spec.md` v1.2 を Normative とし、矛盾する挙動を追加しない。
- 正本は `web/` の Next.js + Prisma + `hourei_rag` DB とし、`src/` + Kysely の `blra` DBへ依存させない。
- 適用アンカーは `TODAY`、`CONFIRMATION_APPLICATION`、`CONSTRUCTION_START`、`EXISTING_BUILDING_ORIGIN`、`CUSTOM` の5種とする。
- `anchor` と `asOf=YYYY-MM-DD` は条文URLへ常に明示する。省略時だけ日本時間の当日へ正規化し、不正値は推測して補正しない。
- 有効期間は `[effectiveFrom, effectiveTo)` とする。候補0件は適用範囲外、2件以上は整合性エラーとし、最寄り版へフォールバックしない。
- 本文の主スクロール、章単位の段階取得、原文座標、既存ハイライトを壊さない。
- 現在の大量の未コミット移植差分を保持し、本計画の対象ファイルだけを編集する。

---

### Task 1: Webテスト実行基盤

**Files:**
- Create: `web/vitest.config.mts`
- Test: `web/src/__tests__/article.test.ts`

**Interfaces:**
- Consumes: `web/tsconfig.json` の `@/* -> ./src/*`
- Produces: Vitest が `@/` を `web/src/` として解決する設定

- [ ] **Step 1: 現在の失敗を再確認する**

Run: `cd web && npm test -- --run src/__tests__/article.test.ts`

Expected: `Cannot find package '@/lib/article/article'` で失敗する。

- [ ] **Step 2: 最小設定を追加する**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: 純粋関数テストが通ることを確認する**

Run: `cd web && npm test -- --run src/__tests__/article.test.ts src/__tests__/legal-number-format.test.ts`

Expected: 2ファイルが PASS。DBデータへ依存するintegrationテストはこの確認へ含めない。

### Task 2: 適用文脈の純粋ドメイン契約

**Files:**
- Create: `web/src/lib/applicability/applicability-context.ts`
- Create: `web/src/__tests__/applicability-context.test.ts`

**Interfaces:**
- Produces: `ApplicabilityAnchorType`、`ApplicabilityContextValue`、`parseApplicabilityContext()`、`todayInJapan()`、`buildArticleHref()`

- [ ] **Step 1: 失敗する単体テストを書く**

```ts
import { describe, expect, it } from "vitest";
import {
  buildArticleHref,
  parseApplicabilityContext,
} from "@/lib/applicability/applicability-context";

describe("parseApplicabilityContext", () => {
  it("省略時は日本時間のTODAYへ正規化を要求する", () => {
    expect(parseApplicabilityContext({}, "2026-07-31")).toEqual({
      kind: "redirect",
      context: { anchor: "TODAY", asOf: "2026-07-31", projectId: null },
    });
  });

  it("存在しない日付を拒否する", () => {
    expect(parseApplicabilityContext(
      { anchor: "CUSTOM", asOf: "2026-02-30" },
      "2026-07-31",
    )).toEqual({ kind: "invalid", reason: "INVALID_AS_OF" });
  });

  it("TODAYの過去日指定を当日へ正規化する", () => {
    expect(parseApplicabilityContext(
      { anchor: "TODAY", asOf: "2025-01-01" },
      "2026-07-31",
    )).toEqual({
      kind: "redirect",
      context: { anchor: "TODAY", asOf: "2026-07-31", projectId: null },
    });
  });
});

describe("buildArticleHref", () => {
  it("適用文脈を条文URLへ明示する", () => {
    expect(buildArticleHref("article-1", {
      anchor: "CONSTRUCTION_START",
      asOf: "2026-04-01",
      projectId: "project-1",
    })).toBe("/articles/article-1?anchor=CONSTRUCTION_START&asOf=2026-04-01&project=project-1");
  });
});
```

- [ ] **Step 2: テストが対象モジュール未存在で失敗することを確認する**

Run: `cd web && npm test -- --run src/__tests__/applicability-context.test.ts`

Expected: `applicability-context` が見つからず FAIL。

- [ ] **Step 3: ISO日付の実在性まで検証する最小実装を書く**

`parseApplicabilityContext` は `valid`、`redirect`、`invalid` の判別共用体を返す。`TODAY` 以外は明示された日付を保持し、`project` は空文字を `null` へ正規化する。`buildArticleHref` は3項目だけを固定順でURLへ出力する。

- [ ] **Step 4: 単体テストを通す**

Run: `cd web && npm test -- --run src/__tests__/applicability-context.test.ts`

Expected: PASS。

### Task 3: 適用日による条文版の一意解決

**Files:**
- Create: `web/src/lib/applicability/revision-selection.ts`
- Create: `web/src/lib/applicability/resolve-applicable-article.ts`
- Create: `web/src/__tests__/revision-selection.test.ts`

**Interfaces:**
- Consumes: `ApplicabilityContextValue`
- Produces: `selectRevisionForDate(revisions, asOf)` と `resolveApplicableArticle(articleId, context)`
- Result: `resolved | coverage_out_of_range | ambiguous | article_not_effective | not_found`

- [ ] **Step 1: 半開区間と曖昧性の失敗テストを書く**

```ts
import { describe, expect, it } from "vitest";
import { selectRevisionForDate } from "@/lib/applicability/revision-selection";

const revisions = [
  { id: "old", effectiveFrom: "2025-01-01", effectiveTo: "2026-04-01" },
  { id: "new", effectiveFrom: "2026-04-01", effectiveTo: null },
];

describe("selectRevisionForDate", () => {
  it("終了日を含まず次版を選ぶ", () => {
    expect(selectRevisionForDate(revisions, "2026-04-01")).toEqual({
      kind: "resolved",
      revisionId: "new",
    });
  });

  it("範囲外で最寄り版を返さない", () => {
    expect(selectRevisionForDate(revisions, "2024-12-31").kind)
      .toBe("coverage_out_of_range");
  });

  it("重複版を曖昧性エラーにする", () => {
    expect(selectRevisionForDate([
      ...revisions,
      { id: "duplicate", effectiveFrom: "2026-01-01", effectiveTo: null },
    ], "2026-05-01").kind).toBe("ambiguous");
  });
});
```

- [ ] **Step 2: モジュール未存在によるFAILを確認する**

Run: `cd web && npm test -- --run src/__tests__/revision-selection.test.ts`

Expected: FAIL。

- [ ] **Step 3: 純粋な版選択を実装してテストを通す**

Run: `cd web && npm test -- --run src/__tests__/revision-selection.test.ts`

Expected: PASS。

- [ ] **Step 4: Prismaアダプターを実装する**

`resolveApplicableArticle` は最初にURLのArticleから `lawId` と `stableNodeKey` を取得する。同一法令で現行 LawBook Edition に収録された非削除Articleを持つRevisionを候補とし、純粋関数へ渡す。選択版内で同じ `stableNodeKey` を持つArticleを取得し、ID・Revision ID・適用期間・法令名を返す。候補やArticleを推測で置換しない。

- [ ] **Step 5: TypeScript検査を通す**

Run: `cd web && npx tsc --noEmit --incremental false`

Expected: PASS。

### Task 4: 適用時点バーと状態表示

**Files:**
- Create: `web/src/contexts/ApplicabilityContext.tsx`
- Create: `web/src/components/applicability/ApplicabilityBar.tsx`
- Create: `web/src/components/applicability/ApplicabilityStatePanel.tsx`
- Modify: `web/src/components/article/ArticleLayout.tsx`

**Interfaces:**
- Consumes: `ApplicabilityContextValue`、解決済みRevisionの適用期間
- Produces: `ApplicabilityProvider`、`useApplicability()`、`applicabilityBar` layout prop

- [ ] **Step 1: Contextの失敗テストを書く**

純粋な `buildArticleHref` のテストへ、プロジェクトなし・特殊文字Article ID・5アンカー全件のケースを追加し、未実装ケースがFAILすることを確認する。

- [ ] **Step 2: Providerを実装する**

Provider は `context` と `lawRevisionId` を保持し、`articleHref(articleId)` を公開する。保存操作が作成時文脈を送れるよう `snapshot` として `{ applicabilityAnchor, applicabilityDate, snapshotLawRevisionId }` も公開する。

- [ ] **Step 3: バーを実装する**

バーはアンカー名と日付を常時テキスト表示する。`TODAY` では日付入力を固定し、その他4種では日付変更を許可する。変更時は現在のArticle ID、`project`、他方の適用パラメータを維持して `router.replace()` する。版の適用期間も文字列で示し、色だけで状態を伝えない。

- [ ] **Step 4: 状態パネルを実装する**

`coverage_out_of_range`、`ambiguous`、`article_not_effective`、`invalid` の各状態について「何が起きたか」「本文への影響」「次の操作」を表示する。`coverage_out_of_range` と `ambiguous` では旧Article本文を表示しない。

- [ ] **Step 5: ArticleLayoutへバー領域を追加する**

パンくずの直下、3カラム本体の直上へ `applicabilityBar` を描画し、本文の内側スクロールへ巻き込まれないようにする。

- [ ] **Step 6: TypeScript検査を通す**

Run: `cd web && npx tsc --noEmit --incremental false`

Expected: PASS。

### Task 5: 条文ページと内部遷移の接続

**Files:**
- Modify: `web/src/app/articles/[id]/page.tsx`
- Modify: `web/src/components/article/ScrollUrlSync.tsx`
- Modify: `web/src/components/toc/TocTree.tsx`
- Modify: `web/src/components/practice/LinkExplorer.tsx`
- Modify: `web/src/components/practice/RecommendationBar.tsx`
- Modify: `web/src/components/practice/GlossaryList.tsx`
- Modify: `web/src/components/system/context-menu/useContextMenu.ts`
- Modify: `web/src/components/search/CommandPalette.tsx`
- Modify: `web/src/components/search/SearchPracticePanel.tsx`
- Modify: `web/src/lib/article/article-renderer.tsx`
- Modify: `web/src/lib/link/link-renderer.tsx`

**Interfaces:**
- Consumes: `resolveApplicableArticle()`、`ApplicabilityProvider.articleHref()`
- Produces: 適用文脈を失わない条文ページと条文内遷移

- [ ] **Step 1: 条文URL生成の回帰テストを追加する**

各遷移元で共通の `buildArticleHref` を使えることを、Task 2の単体テストへアンカー5種のtable testとして追加してFAILを確認する。

- [ ] **Step 2: ページ入口を正規化する**

`searchParams` から適用文脈を解析する。省略または `TODAY` の日付ずれは明示URLへ `redirect()` し、不正値は状態パネルを返す。版解決後にArticle IDが変わる場合は同じ `stableNodeKey` のIDへ文脈を保ってredirectする。

- [ ] **Step 3: 解決成功時だけ本文データを取得する**

`resolved` のときだけ既存の章ウィンドウ・リンク・注釈・ハイライト処理を実行する。範囲外や曖昧性では既存IDの本文を流用しない。閲覧履歴にも解決済みArticle IDを記録する。

- [ ] **Step 4: クライアント遷移へProviderを接続する**

対象コンポーネントの固定 `/articles/${id}` を `articleHref(id)` へ置換する。`ScrollUrlSync` は `window.location.search` を保持する。本文中リンクは `ArticleNode` / `DefinitionNode` からhref生成関数を渡し、リンクの新規タブでも適用文脈を保持する。

- [ ] **Step 5: 型検査と純粋関数テストを通す**

Run: `cd web && npx tsc --noEmit --incremental false && npm test -- --run src/__tests__/applicability-context.test.ts src/__tests__/revision-selection.test.ts`

Expected: PASS。

### Task 6: 保存操作へ作成時スナップショットを保持

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: `web/prisma/migrations/20260731190000_add_applicability_snapshots/migration.sql`
- Modify: `web/src/contexts/AnnotationContext.tsx`
- Modify: `web/src/components/system/context-menu/context-menu-api.ts`
- Modify: `web/src/components/system/context-menu/useContextMenu.ts`
- Modify: `web/src/lib/practice/project.ts`
- Modify: `web/src/app/api/annotations/route.ts`
- Modify: `web/src/app/api/highlights/route.ts`
- Modify: `web/src/app/api/checkitems/route.ts`

**Interfaces:**
- Consumes: `useApplicability().snapshot`
- Produces: ArticleAnnotation、UserHighlight、CheckItemの作成時アンカー・基準日・Revision ID

- [ ] **Step 1: API入力の失敗テストを追加する**

新規保存要求の `applicabilityAnchor` が5種以外なら400、`applicabilityDate` が不正日付なら400となるAPIテストを書く。正常時は3項目がDB応答へ含まれることを期待し、現状でFAILを確認する。

- [ ] **Step 2: Prismaモデルとmigrationを追加する**

```prisma
enum ApplicabilityAnchorType {
  TODAY
  CONFIRMATION_APPLICATION
  CONSTRUCTION_START
  EXISTING_BUILDING_ORIGIN
  CUSTOM
}
```

ArticleAnnotation、UserHighlight、CheckItemへ次をnullableで追加し、既存行を壊さない。

```prisma
applicabilityAnchor ApplicabilityAnchorType?
applicabilityDate   DateTime? @db.Date
snapshotLawRevisionId String?
```

- [ ] **Step 3: 保存APIを実装する**

3項目を共通の純粋バリデーターで検証し、Prisma create/updateへ渡す。Article IDが属する `lawRevisionId` と `snapshotLawRevisionId` が異なる要求は409にして保存しない。

- [ ] **Step 4: 条文画面からの保存要求へsnapshotを付ける**

注釈、ハイライト、確認項目の作成時にProviderのsnapshotを送信する。条文画面外の既存作成経路はnullableのまま互換維持する。

- [ ] **Step 5: Prisma Client生成と型検査を行う**

Run: `cd web && npx prisma generate && npx tsc --noEmit --incremental false`

Expected: PASS。

### Task 7: 検証と引継書更新

**Files:**
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: Tasks 1–6の成果
- Produces: 再現可能な検証記録と次タスク

- [ ] **Step 1: migrationを開発DBへ適用する**

Run: `cd web && npx prisma migrate deploy`

Expected: `20260731190000_add_applicability_snapshots` が適用される。

- [ ] **Step 2: 自動検査を実行する**

Run: `cd web && npx tsc --noEmit --incremental false`

Run: `cd web && npm test -- --run src/__tests__/applicability-context.test.ts src/__tests__/revision-selection.test.ts src/__tests__/article.test.ts src/__tests__/legal-number-format.test.ts`

Expected: 全件PASS。既存integrationテストの開発DB seed不足は別項目として明記する。

- [ ] **Step 3: 実ページを確認する**

確認URL: `/articles/art_325ac0000000201_20260101_000002?anchor=TODAY&asOf=2026-07-31`

確認内容: バーが常時表示される、5アンカーを選べる、CUSTOM日付を変更できる、スクロール追従・目次・本文リンクでクエリが保持される、適用範囲外で本文を推測表示しない。

- [ ] **Step 4: HANDOFFを更新する**

適用時点の実装範囲、migration名、検証結果、残る制約（現行DBは原則1Revision/法令、authority/verification軸は次段階）を記録する。
