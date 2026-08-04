# ページ情報削除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webの連続スクロール閲覧に不要な書籍ページ番号を、画面・API・現行データモデル・取込データ・抄録検証データから削除し、法令と条文の順番を維持する。

**Architecture:** 法令の順番は既存の `displayOrder`、抄録条文の順番は `LawBookEntryRange.sortOrder` を正本として維持する。`printedPage` と `printedPages` は契約ごと削除し、検証証跡はページ番号を介さず条文から画像ファイルへ直接関連付ける。既存DBは前進移行で列と保存済みページ表記を削除する。

**Tech Stack:** Next.js 14、React 18、TypeScript、Vitest、Prisma 5、PostgreSQL

## Global Constraints

- 法令の掲載順を示す `displayOrder` は変更しない。
- 抄録として公開する条文範囲と `LawBookEntryRange.sortOrder` は変更しない。
- 検証元画像ファイル名と条文との対応は維持する。
- 過去のデータベース移行履歴と調査資料は改変しない。
- 本番コードを変更する前に、対応する失敗テストを実行してREDを確認する。
- ユーザーの既存未コミット変更を編集・ステージ・コミットしない。

---

### Task 1: 法令選択ラベルと一覧APIからページ情報を削除する

**Files:**
- Modify: `web/src/__tests__/law-list.test.ts`
- Modify: `web/src/lib/law-book/law-list.ts`
- Modify: `web/src/app/api/laws/route.ts`

**Interfaces:**
- Consumes: `LawListItem.displayOrder: number`、`LawListItem.printedTitle: string`
- Produces: `lawSelectLabel(law: LawListItem): string`。戻り値は `"<displayOrder>. <printedTitle>"` のみで、`printedPage` を含まない。

- [ ] **Step 1: ページなしラベルの失敗テストを書く**

`web/src/__tests__/law-list.test.ts` の2件のfixtureから `printedPage` を削除し、ラベルテストを次の内容へ変更する。

```ts
describe("lawSelectLabel", () => {
  it("掲載順と印刷名称だけを一覧で識別できる", () => {
    expect(lawSelectLabel(laws[1])).toBe("2. 建築基準法施行令（抄）");
  });
});
```

- [ ] **Step 2: テストが期待した理由で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-list.test.ts`

Expected: `lawSelectLabel` の実値に `— p.undefined` が残るためFAILする。

- [ ] **Step 3: クライアント契約とAPIから `printedPage` を削除する**

`web/src/lib/law-book/law-list.ts` を次の契約に変更する。

```ts
export interface LawListItem {
  id: string;
  name: string;
  shortName: string | null;
  printedTitle: string;
  displayOrder: number;
  inclusionMode: "full" | "excerpt";
  firstArticleId: string;
}

export function lawSelectLabel(law: LawListItem): string {
  return `${law.displayOrder}. ${law.printedTitle}`;
}
```

`web/src/app/api/laws/route.ts` のSELECT句から次の行を削除し、他の列と `ORDER BY e."displayOrder"` は維持する。

```sql
e."printedPage",
```

- [ ] **Step 4: 単体テストと型検査を通す**

Run: `cd web && npx vitest run src/__tests__/law-list.test.ts && npx tsc --noEmit`

Expected: すべてPASSし、型エラーが0件になる。

- [ ] **Step 5: Task 1だけをコミットする**

```bash
git add web/src/__tests__/law-list.test.ts web/src/lib/law-book/law-list.ts web/src/app/api/laws/route.ts
git commit -m "fix(reader): remove page numbers from law selector"
```

### Task 2: マニフェスト・DB・抄録検証データからページ情報を削除する

**Files:**
- Modify: `web/src/__tests__/law-book-manifest.test.ts`
- Create: `web/src/__tests__/excerpt-range-evidence.test.ts`
- Modify: `web/scripts/law-book-2026.ts`
- Modify: `web/scripts/laws-config.ts`
- Modify: `web/scripts/seed-law-book.ts`
- Modify: `web/scripts/lib/seed-verified-excerpt-ranges.ts`
- Modify: `web/scripts/verify-law-book.ts`
- Modify: `web/src/__tests__/integration/law-book-scope.test.ts`
- Modify: `web/prisma/schema.prisma`
- Create: `web/prisma/migrations/20260804000000_remove_printed_page_data/migration.sql`

**Interfaces:**
- Consumes: `LAW_BOOK_2026` の `displayOrder`、`printedTitle`、`officialTitle`、`egovLawId`、`inclusionMode`
- Produces: `CIVIL_CODE_ARTICLE_EVIDENCE: ArticleEvidence[]`。各要素は `{ articleNumberNormalized: string; evidenceFiles: string[] }` で、ページ番号を持たない。
- Preserves: 民法（抄）の61条とその順番、および各条文から既存画像ファイルへの対応。

- [ ] **Step 1: 現行データ契約にページ情報がないことを求める失敗テストを書く**

`web/src/__tests__/law-book-manifest.test.ts` のページ値に対する期待を削除し、既存の件数・順番テストに次を追加する。

```ts
expect(LAW_BOOK_2026.every((entry) => !("printedPage" in entry))).toBe(true);
```

テスト名 `全文14件と抄録106件を区別し、書籍掲載頁を失わない` は `全文14件と抄録106件を区別する` に変更する。先頭・末尾要素の期待値は `egovLawId` と `inclusionMode` だけを保持する。

`web/src/__tests__/excerpt-range-evidence.test.ts` を作成する。

```ts
import { describe, expect, it } from "vitest";
import { CIVIL_CODE_PRINTED_ARTICLES } from "../../scripts/lib/seed-verified-excerpt-ranges";

describe("民法（抄）の検証証跡", () => {
  it("ページ番号を保持せず画像ファイルを条文へ直接対応付ける", () => {
    expect(CIVIL_CODE_PRINTED_ARTICLES).toHaveLength(61);
    expect(
      CIVIL_CODE_PRINTED_ARTICLES.every(
        (item) => !("printedPages" in item) && item.evidenceFiles.length > 0,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: 両テストがページ情報の存在によって失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-book-manifest.test.ts src/__tests__/excerpt-range-evidence.test.ts`

Expected: `printedPage` と `printedPages` が現存するため、追加した期待がFAILする。

- [ ] **Step 3: マニフェストと取込設定から `printedPage` を削除する**

`web/scripts/law-book-2026.ts` の `LawBookManifestEntry` から `printedPage: number` を削除し、120要素すべてから `"printedPage": <number>,` を機械的に削除する。各要素の `displayOrder`、法令名、e-Gov ID、`inclusionMode` は変更しない。

`web/scripts/laws-config.ts` の `LawConfig` から `printedPage: number` を削除し、`LAWS` の変換から次を削除する。

```ts
printedPage: entry.printedPage,
```

- [ ] **Step 4: Prismaモデルとseed処理から `printedPage` を削除する**

`web/prisma/schema.prisma` の `LawBookEntry` から次を削除する。

```prisma
printedPage          Int
```

`LawBookEntryRange` のコメント `法書項目の範囲（条文範囲・ページ範囲）` は、現行モデルに合わせて `法書項目の収録範囲` へ変更する。

`web/scripts/seed-law-book.ts` の `LawBookEntry` INSERT/UPSERTから列・更新式・値・引数 `entry.printedPage` を削除する。INSERTの引数は次の15項目へ詰め直す。

```text
$1 id
$2 editionId
$3 lawId
$4 lawRevisionId
$5 displayOrder
$6 inclusionMode
$7 printedTitle
$8 catalogSourceLocator
$9 verificationStatus
$10 verificationNote
$11 sourceUrl
$12 sourceStorageKey
$13 sourceChecksum
$14 sourceFetchedAt
$15 articleCount
```

`catalogSourceLocator` の引数はページなしの次の値にする。

```ts
"総目次"
```

- [ ] **Step 5: 検証証跡をページ番号なしの直接対応へ変更する**

`web/scripts/lib/seed-verified-excerpt-ranges.ts` の型と公開定数を次の形に変更する。

```ts
export interface ArticleEvidence {
  articleNumberNormalized: string;
  evidenceFiles: string[];
}

function evidence(
  articleNumberNormalized: string,
  ...evidenceFiles: string[]
): ArticleEvidence {
  return { articleNumberNormalized, evidenceFiles };
}

export const CIVIL_CODE_ARTICLE_EVIDENCE: ArticleEvidence[] = [
  evidence("1", SOURCE_IMAGES.a),
  evidence("206", SOURCE_IMAGES.a),
  evidence("207", SOURCE_IMAGES.a),
  evidence("209", SOURCE_IMAGES.a),
  evidence("210", SOURCE_IMAGES.a),
  evidence("211", SOURCE_IMAGES.a),
  evidence("212", SOURCE_IMAGES.a),
  evidence("213", SOURCE_IMAGES.a, SOURCE_IMAGES.b),
  evidence("213の2", SOURCE_IMAGES.b),
  evidence("213の3", SOURCE_IMAGES.b),
  evidence("214", SOURCE_IMAGES.b),
  evidence("215", SOURCE_IMAGES.b),
  evidence("216", SOURCE_IMAGES.b),
  evidence("217", SOURCE_IMAGES.b),
  evidence("218", SOURCE_IMAGES.b),
  evidence("219", SOURCE_IMAGES.b),
  evidence("220", SOURCE_IMAGES.b, SOURCE_IMAGES.c),
  evidence("221", SOURCE_IMAGES.c),
  evidence("222", SOURCE_IMAGES.c),
  evidence("223", SOURCE_IMAGES.c),
  evidence("224", SOURCE_IMAGES.c),
  evidence("225", SOURCE_IMAGES.c),
  evidence("226", SOURCE_IMAGES.c),
  evidence("227", SOURCE_IMAGES.c),
  evidence("228", SOURCE_IMAGES.c),
  evidence("229", SOURCE_IMAGES.c),
  evidence("230", SOURCE_IMAGES.c),
  evidence("231", SOURCE_IMAGES.c),
  evidence("232", SOURCE_IMAGES.c),
  evidence("233", SOURCE_IMAGES.c, SOURCE_IMAGES.d),
  evidence("234", SOURCE_IMAGES.d),
  evidence("235", SOURCE_IMAGES.d),
  evidence("236", SOURCE_IMAGES.d),
  evidence("237", SOURCE_IMAGES.d),
  evidence("238", SOURCE_IMAGES.d),
  evidence("264の2", SOURCE_IMAGES.d),
  evidence("264の3", SOURCE_IMAGES.d),
  evidence("264の8", SOURCE_IMAGES.d, SOURCE_IMAGES.e),
  evidence("264の9", SOURCE_IMAGES.e),
  evidence("264の10", SOURCE_IMAGES.e),
  evidence("264の14", SOURCE_IMAGES.e),
  evidence("415", SOURCE_IMAGES.e),
  evidence("541", SOURCE_IMAGES.f),
  evidence("542", SOURCE_IMAGES.f),
  evidence("543", SOURCE_IMAGES.f),
  evidence("559", SOURCE_IMAGES.f),
  evidence("562", SOURCE_IMAGES.f),
  evidence("563", SOURCE_IMAGES.f, SOURCE_IMAGES.g),
  evidence("564", SOURCE_IMAGES.g),
  evidence("565", SOURCE_IMAGES.g),
  evidence("566", SOURCE_IMAGES.g),
  evidence("567", SOURCE_IMAGES.g),
  evidence("632", SOURCE_IMAGES.g),
  evidence("633", SOURCE_IMAGES.g),
  evidence("634", SOURCE_IMAGES.g),
  evidence("635", SOURCE_IMAGES.h),
  evidence("636", SOURCE_IMAGES.h),
  evidence("637", SOURCE_IMAGES.h),
  evidence("641", SOURCE_IMAGES.h),
  evidence("642", SOURCE_IMAGES.h),
  evidence("709", SOURCE_IMAGES.h),
];
```

旧 `pageEvidence` の8画像は、ページ番号をキーにせず次の文字列値だけを利用する。

```ts
const SOURCE_IMAGES = {
  a: "1785240027901.jpg",
  b: "1785240027879.jpg",
  c: "1785240027853.jpg",
  d: "1785240027828.jpg",
  e: "1785240027801.jpg",
  f: "1785240027745.jpg",
  g: "1785240158168.jpg",
  h: "1785240158129.jpg",
} as const;
```

各 `evidence()` 呼出しでは、従来参照していた画像と同じ `SOURCE_IMAGES.a`〜`h` を渡す。複数画像にまたがる条文は同じ2画像を同じ順番で保持する。

Rangeの `inclusionReason` は次の形式に変更する。

```ts
`検証画像（${item.evidenceFiles.join(", ")}）`
```

Entryの `verificationNote` は次のページなし文言に変更する。

```text
収録範囲照合済み。掲載61条を個別Range化。第638条から第640条までは原典上「削除」表示のためArticle Rangeなし。
```

`web/scripts/verify-law-book.ts` は公開定数 `CIVIL_CODE_ARTICLE_EVIDENCE` をimportする。`web/src/__tests__/integration/law-book-scope.test.ts` のローカル文字列配列は `CIVIL_CODE_ARTICLE_NUMBERS` へ変更する。両ファイルの `PRINTED` とページ番号を含むテスト名・エラー文を「収録条文」「収録順」に置き換え、61条の配列内容と順序は変更しない。

`web/scripts/verify-law-book.ts` に現行DBのページ情報消去を確認する次の検証を追加する。

```ts
interface PageDataSummaryRow {
  printedPageColumnCount: bigint;
  catalogPageCount: bigint;
  rangePageCount: bigint;
  notePageCount: bigint;
}

const pageDataRows = await prisma.$queryRawUnsafe<PageDataSummaryRow[]>(
  `SELECT
     (SELECT COUNT(*)::bigint
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'LawBookEntry'
         AND column_name = 'printedPage') AS "printedPageColumnCount",
     (SELECT COUNT(*)::bigint
        FROM "LawBookEntry"
       WHERE "catalogSourceLocator" ~ 'p[.][0-9]|頁') AS "catalogPageCount",
     (SELECT COUNT(*)::bigint
        FROM "LawBookEntryRange"
       WHERE "inclusionReason" ~ 'p[.][0-9]|頁') AS "rangePageCount",
     (SELECT COUNT(*)::bigint
        FROM "LawBookEntry"
       WHERE "verificationNote" ~ 'p[.][0-9]|頁') AS "notePageCount"`,
);
const pageData = pageDataRows[0];
assert(Number(pageData.printedPageColumnCount) === 0, "printedPage列が残っています");
assert(Number(pageData.catalogPageCount) === 0, "総目次参照にページ番号が残っています");
assert(Number(pageData.rangePageCount) === 0, "Range検証理由にページ番号が残っています");
assert(Number(pageData.notePageCount) === 0, "Entry検証メモにページ番号が残っています");
```

`web/src/__tests__/excerpt-range-evidence.test.ts` のimportも `CIVIL_CODE_ARTICLE_EVIDENCE` へ変更する。

- [ ] **Step 6: 既存DBからページ列と保存済みページ表記を削除する移行を作る**

`web/prisma/migrations/20260804000000_remove_printed_page_data/migration.sql` を次の内容で作成する。

```sql
ALTER TABLE "LawBookEntry" DROP COLUMN "printedPage";

UPDATE "LawBookEntry"
SET "catalogSourceLocator" = '総目次'
WHERE "catalogSourceLocator" LIKE '総目次 p.%';

UPDATE "LawBookEntryRange"
SET "inclusionReason" = regexp_replace(
  "inclusionReason",
  '^紙面p\.[^（]+',
  '検証画像'
)
WHERE "inclusionReason" ~ '^紙面p\.';

UPDATE "LawBookEntry"
SET "verificationNote" = '収録範囲照合済み。掲載61条を個別Range化。第638条から第640条までは原典上「削除」表示のためArticle Rangeなし。'
WHERE "verificationNote" LIKE '紙面p.%照合済み。%';
```

過去の `20260728000000_add_law_book_registry/migration.sql` は変更しない。

- [ ] **Step 7: Task 2の単体テスト、Prisma検証、型検査を通す**

Run: `cd web && npx vitest run src/__tests__/law-book-manifest.test.ts src/__tests__/excerpt-range-evidence.test.ts src/__tests__/law-list.test.ts && npx prisma validate && npx prisma generate && npx tsc --noEmit`

Expected: すべてPASSし、Prisma schemaとTypeScriptにエラーがない。

- [ ] **Step 8: 現行コードとデータ定義にページ情報が残っていないことを確認する**

Run:

```bash
rg -n 'printedPage|printedPages|pageEvidence|総目次 p\.|紙面p\.' \
  web/src web/scripts web/prisma/schema.prisma \
  web/prisma/migrations/20260804000000_remove_printed_page_data/migration.sql
```

Expected: 新しい移行SQLの検索条件以外に該当がない。過去の移行履歴と調査資料は検索対象外とする。

- [ ] **Step 9: Task 2だけをコミットする**

```bash
git add web/src/__tests__/law-book-manifest.test.ts \
  web/src/__tests__/excerpt-range-evidence.test.ts \
  web/scripts/law-book-2026.ts web/scripts/laws-config.ts \
  web/scripts/seed-law-book.ts web/scripts/lib/seed-verified-excerpt-ranges.ts \
  web/scripts/verify-law-book.ts web/src/__tests__/integration/law-book-scope.test.ts \
  web/prisma/schema.prisma \
  web/prisma/migrations/20260804000000_remove_printed_page_data/migration.sql
git commit -m "refactor(lawbook): remove printed page data"
```

### Task 3: DB移行と全体回帰検証を行う

**Files:**
- Verify: `web/prisma/migrations/20260804000000_remove_printed_page_data/migration.sql`
- Verify: `web/src/app/api/laws/route.ts`
- Verify: `web/src/components/toc/TocPanel.tsx`

**Interfaces:**
- Consumes: ページ情報を含まない `LawListItem[]` と、`displayOrder` 順の `/api/laws` レスポンス
- Produces: ページ番号を表示せず、既存順序で法令を選択できるスクロール型リーダー

- [ ] **Step 1: 適用対象DBと移行状態を読み取り確認する**

Run: `cd web && npx prisma migrate status`

Expected: 対象DBへ接続でき、新規移行だけが未適用と表示される。接続不能または履歴不整合ならDBを変更せず停止して状況を報告する。

- [ ] **Step 2: ページ情報削除の前進移行を適用する**

Run: `cd web && npx prisma migrate deploy`

Expected: `20260804000000_remove_printed_page_data` が成功し、既存DBの `printedPage` 列と保存済みページ表記が削除される。

- [ ] **Step 3: 関連テストと法令集完全性検証を実行する**

Run:

```bash
cd web
npx vitest run \
  src/__tests__/law-list.test.ts \
  src/__tests__/law-book-manifest.test.ts \
  src/__tests__/excerpt-range-evidence.test.ts \
  src/__tests__/integration/law-book-scope.test.ts
npm run lawbook:verify
npm run test:e2e
```

Expected: すべてPASSし、法令120件、民法（抄）61条、法令と条文の順番が維持される。

- [ ] **Step 4: Web全体のテスト・型検査・ビルドを実行する**

Run: `cd web && npm test && npx tsc --noEmit && npm run build`

Expected: テスト失敗0件、型エラー0件、Next.js build終了コード0。

- [ ] **Step 5: 最終差分とユーザー所有の変更が混入していないことを確認する**

Run: `git status --short && git diff HEAD~2 --check && git diff HEAD~2 --stat`

Expected: `AGENTS.md` と既存の未追跡計画書はコミットされず、今回の変更対象だけが直近2コミットに含まれる。

- [ ] **Step 6: 検証結果を報告する**

次を明記する。

```text
- 法令選択表示: 順番番号と法令名のみ
- ページデータ: 現行DB・API・取込・検証データから削除
- 維持した情報: 法令120件の順番、民法（抄）61条の順番、検証画像対応
- 検証: 関連テスト、全テスト、型検査、ビルド、法令集完全性検証の実結果
```
