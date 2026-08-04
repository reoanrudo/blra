# e-Gov現行施行版の差分更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 収録120法令を実行日に施行中のe-Gov現行版へそろえ、以後は改定法令だけを検証・差分更新する。

**Architecture:** `ksk-2026` は不変の収録カタログとして維持し、公開本文は `Law.currentRevisionId` が指す検証済みRevisionから読む。毎日は版番号だけを確認し、変更法令だけ全文XMLを不変保存してステージングし、意味上の条文位置による差分・範囲・リンク検証後に法令単位のトランザクションで切り替える。

**Tech Stack:** Node.js 22、TypeScript 5、Next.js 14、React 18、Prisma 5.22、PostgreSQL、Vitest 4、Playwright 1.62、fast-xml-parser 5

## Global Constraints

- 対象は `LAW_BOOK_2026` に登録された120法令だけとする。
- Asia/Tokyoの実行日に施行中の `revision_info` を選び、将来施行版を先取りしない。
- 変更のない法令ではXML取得、LawRevision作成、Article書換えを行わない。
- e-Gov原本、既存LawRevision、既存Article、保存済み利用者根拠を上書き・物理削除しない。
- 条文のリビジョン間同一性に `sortOrder` やXML走査順の連番を使わない。
- 曖昧な改番、検証失敗、e-Gov障害では当該法令の旧版を維持する。
- 1法令の失敗で他法令の正常更新を止めない。
- `ksk-2026` の `effectiveAsOf` と `LawBookEntry.lawRevisionId` を現行版ポインタとして書き換えない。
- 日次確認は04:00 JST。公開環境と永続DBがない間は有効化済みと表現しない。
- 秘密鍵、DB URL、通知先の秘密情報をGitへ追加しない。
- 既存の未コミット `AGENTS.md` はユーザー変更として保持し、stageしない。
- 各タスクは失敗テストから始め、対象テスト成功後に小さくコミットする。
- 正本設計は `docs/superpowers/specs/2026-08-04-current-law-incremental-refresh-design.md` とする。

---

## File Structure

### 新規ファイル

- `web/prisma/migrations/20260804090000_add_current_law_refresh/migration.sql`: 更新監査、durable key、Revision間対応、範囲解決のDB変更
- `web/src/lib/law-refresh/types.ts`: 更新処理で共有する型と公開エラーコード
- `web/src/lib/law-refresh/parse-law-xml.ts`: e-Gov XMLをRevision非依存の意味キー付きノードへ変換
- `web/src/lib/law-refresh/egov-client.ts`: 対象日時点のメタデータと変更法令XMLだけを取得
- `web/src/lib/law-refresh/xml-store.ts`: 公式XMLのチェックサム検証と不変保存
- `web/src/lib/law-refresh/diff-law-revisions.ts`: durable key/checksumによる条文差分判定
- `web/src/lib/law-refresh/verify-candidate.ts`: 構造、改番、範囲、公開整合の検証ゲート
- `web/src/lib/law-refresh/range-resolution.ts`: 書籍引用範囲を対象Revisionへ解決
- `web/src/lib/law-refresh/package-signer.ts`: manifest checksumとEd25519署名
- `web/src/lib/law-refresh/refresh-repository.ts`: run監査、ステージング、法令単位の切替
- `web/src/lib/law-refresh/refresh-service.ts`: 確認から切替までのオーケストレーション
- `web/src/lib/law-refresh/article-successor.ts`: 旧Articleから現行Articleへの連鎖解決
- `web/src/lib/law-book/current-scope.ts`: カタログ所属と現行Revisionを分離するSQL契約
- `web/src/components/article/HistoricalArticleNotice.tsx`: 削除・過去条文の説明画面
- `web/scripts/refresh-current-laws.ts`: check-only、dry-run、本更新のCLI
- `web/scripts/backfill-current-law-durable-keys.ts`: 現行120法令のdurable key安全移行
- `web/scripts/verify-current-laws.ts`: 公開現行版の完全性とe-Gov版番号の検査
- `web/scripts/generate-law-package-signing-key.ts`: Git管理外のローカル署名鍵生成
- `web/src/__tests__/fixtures/minimal-law-xml.ts`: 挿入・変更・改番テスト用の最小公式形XML
- `web/src/__tests__/law-refresh-*.test.ts`: 純粋関数と取得・署名・サービスの単体テスト
- `web/src/__tests__/integration/current-law-*.test.ts`: DB切替、公開境界、旧URL、範囲解決の統合テスト
- `web/e2e/current-law-refresh.spec.ts`: 現行版表示と旧URLのブラウザテスト
- `docs/operations/current-law-refresh.md`: 日次・手動実行、障害復旧、鍵、永続XML領域の運用手順
- `docs/operations/2026-08-current-law-initial-refresh.md`: 初回更新の実測結果

### 主な変更ファイル

- `web/prisma/schema.prisma`: 更新用enum/model/relationとArticle/LawRevisionの出典列
- `web/scripts/ingest.ts`: XML解析を共通parserへ委譲
- `web/package.json`: check、refresh、verify、backfill、keygenコマンド
- `web/.env.example`: XML保存先と署名鍵パスの名前だけを記載
- `.gitignore`: `.secrets/` と不変XML保存先のローカル既定値を除外
- `web/src/lib/law-book/sql-scope.ts`: 固定書籍版用scopeを明示して残す
- `web/src/lib/article/full-law-document.ts`: 施行日、e-Gov更新日時、確認状態のDTO
- `web/src/lib/article/full-law-repository.ts`: 現行Revisionと同期状態を取得
- `web/src/lib/article/article.ts`: 公開ArticleをcurrentRevisionへ限定
- `web/src/lib/article/chapter-window.ts`: 章取得をcurrentRevisionへ限定
- `web/src/lib/link/link.ts`: currentRevision間リンクへ限定
- `web/src/lib/link/link-detector.ts`: currentRevisionの対象判定へ変更
- `web/src/app/page.tsx`: 先頭ArticleをcurrentRevisionから選択
- `web/src/app/articles/[id]/page.tsx`: 旧URL転送と削除条文表示
- `web/src/app/api/laws/route.ts`: 一覧順は書籍、先頭Articleは現行版
- `web/src/app/api/law-toc/route.ts`: 現行版目次
- `web/src/app/api/articles/by-number/route.ts`: 現行版条番号検索
- `web/src/app/api/articles/preview/route.ts`: 現行版プレビュー
- `web/src/app/api/articles/chapter-window/route.ts`: 現行版章ウィンドウ
- `web/src/app/api/search/route.ts`: 現行版本文検索
- `web/src/app/api/search/suggest/route.ts`: 現行版候補
- `web/src/app/api/export/route.ts`: 現行版だけを出力
- `web/src/lib/practice/export-validator.ts`: 現行Revisionで入力検証
- `web/src/lib/applicability/resolve-applicable-article.ts`: snapshotとcurrentを混同しない
- `web/src/lib/relations/confirmed-relations-repository.ts`: 現行Revisionの関係だけを返す
- `web/src/lib/relations/confirmed-relation-service.ts`: 新Revisionへの暗黙継承を禁止
- `web/src/components/article/FullLawReader.tsx`: 固定基準日を現行版メタデータへ置換

---

### Task 1: Prisma履歴を安全にベースライン化し、更新用スキーマを追加する

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: `web/prisma/migrations/20260804090000_add_current_law_refresh/migration.sql`
- Create: `web/src/__tests__/integration/current-law-schema.test.ts`

**Interfaces:**
- Produces: `LawRefreshRun`, `LawRefreshLawResult`, `LawSyncState`, `ArticleRevisionMapping`, `LawBookEntryRangeResolution`
- Produces: `Article.durableNodeKey: string | null`, `Article.bodyChecksum: string | null`
- Produces: `LawRevision.sourceUpdatedAt`, `LawRevision.repealStatus`, `LawRevision.repealDate`

- [ ] **Step 1: 現在のDBを回復可能にバックアップする**

Run:

```bash
cd web
set -a
source .env
set +a
mkdir -p ../../blra-backups
BLRA_REFRESH_BACKUP=../../blra-backups/hourei_rag-before-current-refresh.dump
pg_dump "$DATABASE_URL" --format=custom --file "$BLRA_REFRESH_BACKUP"
pg_restore --list "$BLRA_REFRESH_BACKUP" >/dev/null
```

Expected: `pg_restore --list` が0終了し、dumpファイルがGit管理外に存在する。

- [ ] **Step 2: ライブDBと現行Prisma schemaが一致することを確認して未記録migrationだけをベースライン化する**

Run:

```bash
cd web
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: 差分なしで0終了する。差分が1件でもあれば `migrate resolve` を実行せず停止する。

差分なしの場合だけRun:

```bash
npx prisma migrate resolve --applied 20260510000000_add_project_context
npx prisma migrate resolve --applied 20260511000000_add_cooccurrence
npx prisma migrate resolve --applied 20260520000000_add_condition_highlight
npx prisma migrate resolve --applied 20260521000000_add_article_annotation
npx prisma migrate resolve --applied 20260728000000_add_law_book_registry
npx prisma migrate resolve --applied 20260729000000_add_display_highlight_columns
npx prisma migrate resolve --applied 20260729010000_backfill_highlight_checksums
npx prisma migrate resolve --applied 20260731190000_add_applicability_snapshots
npx prisma migrate status
```

Expected: `Database schema is up to date!`。

- [ ] **Step 3: 新規テーブルと列がまだ存在しないことを示す失敗テストを書く**

```typescript
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe("current-law refresh schema", () => {
  it("更新監査・対応表・範囲解決とdurable keyを持つ", async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT
        to_regclass('public."LawRefreshRun"') IS NOT NULL
        AND to_regclass('public."LawRefreshLawResult"') IS NOT NULL
        AND to_regclass('public."LawSyncState"') IS NOT NULL
        AND to_regclass('public."ArticleRevisionMapping"') IS NOT NULL
        AND to_regclass('public."LawBookEntryRangeResolution"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Article' AND column_name = 'durableNodeKey'
        ) AS ok
    `;
    expect(rows[0].ok).toBe(true);
  });
});
```

- [ ] **Step 4: テストが期待どおり失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/current-law-schema.test.ts`

Expected: `expected false to be true`。

- [ ] **Step 5: Prisma modelとmigrationを追加する**

`schema.prisma` には次のenumを同じ綴りで追加する。

```prisma
enum LawRefreshTrigger { scheduled manual }
enum LawRefreshRunStatus { running succeeded partial failed }
enum LawRefreshLawStatus { unchanged updated held failed }
enum LawRefreshPhase { checking fetching parsing diffing verifying activating completed }
enum ArticleRevisionMappingKind { unchanged modified renumbered removed }
enum ArticleRevisionMappingStatus { automatic verified ambiguous }
enum LawBookRangeResolutionStatus { resolved blocked }
```

モデルの必須制約は次とする。

```prisma
model LawRefreshRun {
  id          String              @id @default(cuid())
  targetDate  DateTime            @db.Date
  trigger     LawRefreshTrigger
  status      LawRefreshRunStatus @default(running)
  startedAt   DateTime            @default(now())
  completedAt DateTime?
  summary     Json?
  packageId   String?             @unique
  package     LawPackage?         @relation(fields: [packageId], references: [id], onDelete: Restrict)
  results     LawRefreshLawResult[]
  @@index([targetDate, startedAt])
}

model LawRefreshLawResult {
  id                   String              @id @default(cuid())
  runId                String
  lawId                String
  previousRevisionId   String?
  candidateRevisionId  String?
  observedVersionKey   String?
  status               LawRefreshLawStatus
  phase                LawRefreshPhase
  diffSummary          Json?
  errorCode            String?
  errorDetail          String?
  startedAt            DateTime            @default(now())
  completedAt          DateTime?
  run                  LawRefreshRun       @relation(fields: [runId], references: [id], onDelete: Cascade)
  law                  Law                 @relation(fields: [lawId], references: [id], onDelete: Restrict)
  @@unique([runId, lawId])
  @@index([lawId, startedAt])
}

model LawSyncState {
  lawId                  String    @id
  lastAttemptAt          DateTime?
  lastSuccessfulCheckAt  DateTime?
  lastUpdatedAt          DateTime?
  lastObservedVersionKey String?
  lastEgovUpdatedAt      DateTime?
  lastErrorCode          String?
  lastErrorDetail        String?
  repealStatus           String?
  repealDate             DateTime?
  updatedAt              DateTime  @updatedAt
  law                    Law       @relation(fields: [lawId], references: [id], onDelete: Cascade)
}

model ArticleRevisionMapping {
  id               String                       @id @default(cuid())
  lawId            String
  fromRevisionId   String
  toRevisionId     String
  fromArticleId    String
  toArticleId      String?
  kind             ArticleRevisionMappingKind
  status           ArticleRevisionMappingStatus
  method           String
  rationale        String?
  verifiedBy       String?
  verifiedAt       DateTime?
  createdAt        DateTime                     @default(now())
  @@unique([fromRevisionId, toRevisionId, fromArticleId])
  @@index([fromArticleId, status])
  @@index([toArticleId])
}

model LawBookEntryRangeResolution {
  id                    String                       @id @default(cuid())
  lawBookEntryRangeId   String
  lawRevisionId         String
  startDurableNodeKey   String?
  endDurableNodeKey     String?
  status                LawBookRangeResolutionStatus
  errorCode             String?
  verifiedAt            DateTime?
  createdAt             DateTime                     @default(now())
  lawBookEntryRange     LawBookEntryRange            @relation(fields: [lawBookEntryRangeId], references: [id], onDelete: Cascade)
  lawRevision           LawRevision                 @relation(fields: [lawRevisionId], references: [id], onDelete: Restrict)
  @@unique([lawBookEntryRangeId, lawRevisionId])
  @@index([lawRevisionId, status])
}
```

`ArticleRevisionMapping` の `lawId/fromRevisionId/toRevisionId/fromArticleId/toArticleId` にはそれぞれ `Law`、`LawRevision`、`Article` への名前付きrelationを付け、対応する逆relation配列を各modelへ追加する。`Law` には `syncState` と `refreshResults`、`LawPackage` には `refreshRun`、`LawBookEntryRange` には `resolutions` を追加する。

`LawRevision` へ次を追加する。

```prisma
sourceUpdatedAt DateTime?
repealStatus    String?
repealDate      DateTime?
```

`Article.durableNodeKey` と `bodyChecksum` は既存legacy行のためnullableで追加し、migration SQLに次のpartial unique indexを含める。

```sql
CREATE UNIQUE INDEX "Article_lawRevisionId_durableNodeKey_key"
  ON "Article"("lawRevisionId", "durableNodeKey")
  WHERE "durableNodeKey" IS NOT NULL;
```

Run:

```bash
cd web
npx prisma format
git show --output=/tmp/blra-schema-before-current-refresh.prisma HEAD:web/prisma/schema.prisma
mkdir -p prisma/migrations/20260804090000_add_current_law_refresh
npx prisma migrate diff --from-schema-datamodel /tmp/blra-schema-before-current-refresh.prisma --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/20260804090000_add_current_law_refresh/migration.sql
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 6: schemaテストとPrisma検査を通す**

Run:

```bash
cd web
npx prisma validate
npx prisma migrate status
npx vitest run src/__tests__/integration/current-law-schema.test.ts
npx tsc --noEmit
```

Expected: 全コマンド0終了。

- [ ] **Step 7: スキーマ変更だけをコミットする**

```bash
git add web/prisma/schema.prisma web/prisma/migrations/20260804090000_add_current_law_refresh web/src/__tests__/integration/current-law-schema.test.ts
git commit -m "feat(refresh): add current-law provenance schema"
```

---

### Task 2: XML parserを共通化し、並び順に依存しないdurable keyを作る

**Files:**
- Create: `web/src/lib/law-refresh/types.ts`
- Create: `web/src/lib/law-refresh/parse-law-xml.ts`
- Create: `web/src/__tests__/fixtures/minimal-law-xml.ts`
- Create: `web/src/__tests__/law-refresh-parser.test.ts`
- Modify: `web/scripts/ingest.ts`

**Interfaces:**
- Produces: `parseLawXml(xml: string, context: ParseLawContext): ParsedLawDocument`
- Produces: `materializeArticleRows(document: ParsedLawDocument, idPrefix: string): ArticleRow[]`
- Produces: `ParsedLawNode.durableNodeKey`, `contentChecksum`, `bodyChecksum`, `sourceIndex`, `parentSourceIndex`
- Consumes later: Task 4 diff engine、Task 5 verifier、Task 7 refresh service、Task 8 backfill

- [ ] **Step 1: 条文挿入で後続キーがずれない失敗テストを書く**

```typescript
import { describe, expect, it } from "vitest";
import { makeMinimalLawXml } from "@/__tests__/fixtures/minimal-law-xml";
import { parseLawXml } from "@/lib/law-refresh/parse-law-xml";

const context = {
  lawId: "law-test",
  egovLawId: "325AC0000000201",
  revisionId: "rev-test",
} as const;

describe("parseLawXml durable keys", () => {
  it("第10条の2を挿入しても第11条のkeyを維持する", () => {
    const before = parseLawXml(makeMinimalLawXml(["10", "11"]), context);
    const after = parseLawXml(makeMinimalLawXml(["10", "10_2", "11"]), context);
    const key = (doc: typeof before, num: string) =>
      doc.nodes.find((node) => node.level === "article" && node.articleNumberNormalized === num)?.durableNodeKey;

    expect(key(after, "10の2")).toBe("main/article:10の2");
    expect(key(after, "11")).toBe(key(before, "11"));
  });
});
```

`makeMinimalLawXml` は `Law > LawBody > MainProvision > Article` と、各Articleの `@_Num`、`ArticleTitle`、`Paragraph`、`ParagraphSentence` を生成する。`10_2` はXML属性 `Num="10_2"`、表示 `第十条の二` にする。

- [ ] **Step 2: 新規moduleがないため失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-parser.test.ts`

Expected: `Cannot find module '@/lib/law-refresh/parse-law-xml'`。

- [ ] **Step 3: parserの共有型と公開関数を実装する**

```typescript
export interface ParseLawContext {
  lawId: string;
  egovLawId: string;
  revisionId: string;
}

export interface ParsedLawNode {
  sourceIndex: number;
  parentSourceIndex: number | null;
  level: ArticleLevel;
  legacyStableNodeKey: string;
  durableNodeKey: string;
  contentChecksum: string;
  bodyChecksum: string;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  paragraphNumber: string | null;
  itemNumber: string | null;
  subitemNumber: string | null;
  title: string | null;
  caption: string | null;
  text: string | null;
  sortOrder: number;
  systemTags: Record<string, unknown> | null;
}

export interface ParsedLawDocument {
  lawId: string;
  egovLawId: string;
  revisionId: string;
  nodes: ParsedLawNode[];
}
```

キーsegmentは本則を `main`、条を `article:<normalized>`、項を `paragraph:<number>`、号を `item:<number>` とする。附則は公式改正法令番号または公布日を含む。番号のないノードは `tag + normalized title + bodyChecksum` でfingerprintを作り、同一親内で重複した場合はparser errorにする。`sortOrder` はdurable key生成へ渡さない。既存DBとの一度限りのbackfill照合用に、現行式 `${parentLegacyKey}/${level}:${semanticNumber}@${sortOrder}` も `legacyStableNodeKey` として同時生成するが、Revision間diffには使用しない。

`bodyChecksum` は番号を除いた `level/title/caption/text/systemTags` のcanonical JSONをSHA-256化する。`contentChecksum` は既存 `web/scripts/lib/article-content-checksum.ts` の `computeArticleContentChecksum` をそのまま呼び、backfill前後で値を変えない。

- [ ] **Step 4: 既存ingestを新parserへ委譲する**

`ingest.ts` の `parseXML()` と `walkXML()` の責務を `parse-law-xml.ts` へ移し、ファイル読込後に次を呼ぶ。

```typescript
const parsed = parseLawXml(xmlContent, {
  lawId,
  egovLawId: config.egovLawId,
  revisionId,
});
const rows = materializeArticleRows(parsed, idPrefix);
```

`materializeArticleRows()` はsourceIndexからRevision固有Article IDとparentIdを決めるが、durable keyへIDや走査順を混ぜない。

- [ ] **Step 5: parserと既存取込テストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-parser.test.ts src/__tests__/normalize-article.test.ts
npx tsx scripts/ingest.ts 325AC0000000201 --dry-run
npx tsc --noEmit
```

Expected: parserテストPASS、dry-runの条文行数が現行結果と一致、型エラー0。

- [ ] **Step 6: parser共通化をコミットする**

```bash
git add web/src/lib/law-refresh/types.ts web/src/lib/law-refresh/parse-law-xml.ts web/src/__tests__/fixtures/minimal-law-xml.ts web/src/__tests__/law-refresh-parser.test.ts web/scripts/ingest.ts
git commit -m "refactor(refresh): extract revision-safe law parser"
```

---

### Task 3: e-Gov現行版clientと公式XMLの不変storeを作る

**Files:**
- Create: `web/src/lib/law-refresh/egov-client.ts`
- Create: `web/src/lib/law-refresh/xml-store.ts`
- Create: `web/src/__tests__/law-refresh-egov-client.test.ts`
- Create: `web/src/__tests__/law-refresh-xml-store.test.ts`
- Modify: `.gitignore`
- Modify: `web/.env.example`

**Interfaces:**
- Produces: `getLawVersionAt(lawId: string, asOf: string, fetcher?: typeof fetch): Promise<EgovLawVersion>`
- Produces: `getLawXmlAt(version: EgovLawVersion, asOf: string, fetcher?: typeof fetch): Promise<FetchedLawXml>`
- Produces: `FileSystemLawXmlStore.put(input: Pick<FetchedLawXml, "lawId" | "revisionId" | "xml">): Promise<StoredLawXml>`

- [ ] **Step 1: 対象日のrevision_infoだけを選ぶ失敗テストを書く**

```typescript
it("asofを必須にしcurrent_revision_infoの将来版を選ばない", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    laws: [{
      law_info: { law_id: "325AC0000000201" },
      revision_info: {
        law_revision_id: "rev-enforced",
        law_title: "建築基準法",
        amendment_enforcement_date: "2026-05-27",
        updated: "2026-05-27T10:30:46+09:00",
        repeal_status: "None",
      },
      current_revision_info: { law_revision_id: "rev-future" },
    }],
  })));

  const value = await getLawVersionAt("325AC0000000201", "2026-08-04", fetcher);
  expect(value.revisionId).toBe("rev-enforced");
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("asof")).toBe("2026-08-04");
});
```

- [ ] **Step 2: 公式版番号とchecksumで不変保存する失敗テストを書く**

```typescript
it("同じRevisionへ異なるXMLを保存しようとすると拒否する", async () => {
  const root = await mkdtemp(join(tmpdir(), "blra-law-xml-"));
  const store = new FileSystemLawXmlStore(root);
  await store.put({ lawId: "law-1", revisionId: "rev-1", xml: "<Law><MainProvision/></Law>" });
  await expect(store.put({
    lawId: "law-1",
    revisionId: "rev-1",
    xml: "<Law><MainProvision><Article/></MainProvision></Law>",
  })).rejects.toMatchObject({ code: "XML_CHECKSUM_CONFLICT" });
});
```

- [ ] **Step 3: テストがmodule未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-egov-client.test.ts src/__tests__/law-refresh-xml-store.test.ts`

Expected: import error。

- [ ] **Step 4: clientとstoreを実装する**

```typescript
export interface EgovLawVersion {
  lawId: string;
  revisionId: string;
  title: string;
  effectiveFrom: string;
  sourceUpdatedAt: string;
  repealStatus: string;
  repealDate: string | null;
}

export interface FetchedLawXml {
  lawId: string;
  revisionId: string;
  xml: string;
  checksum: string;
  sourceUrl: string;
  fetchedAt: Date;
}
```

`getLawVersionAt` は `/api/2/laws?law_id=...&asof=YYYY-MM-DD&response_format=json` を使い、完全一致law IDを1件だけ許可する。`getLawXmlAt` は直前に検証済みの `EgovLawVersion` を受け取り、`/api/2/law_file/xml/{lawId}?asof=YYYY-MM-DD` を使う。`Law` と `MainProvision` を必須にし、取得結果へ入力versionのrevision IDを記録してSHA-256を計算する。

storeの既定rootは `LAW_XML_STORAGE_DIR` を必須とし、開発用例だけ `web/.env.example` に `LAW_XML_STORAGE_DIR=./var/law-xml` と記載する。`.gitignore` へ `web/var/law-xml/` を追加する。保存先は `<root>/<lawId>/<revisionId>/<sha256>.xml`、一時ファイルからrenameして原子的に確定する。

- [ ] **Step 5: テストと型検査を通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-egov-client.test.ts src/__tests__/law-refresh-xml-store.test.ts
npx tsc --noEmit
```

Expected: 全PASS。

- [ ] **Step 6: client/storeをコミットする**

```bash
git add .gitignore web/.env.example web/src/lib/law-refresh/egov-client.ts web/src/lib/law-refresh/xml-store.ts web/src/__tests__/law-refresh-egov-client.test.ts web/src/__tests__/law-refresh-xml-store.test.ts
git commit -m "feat(refresh): fetch and preserve official current XML"
```

---

### Task 4: 条文差分engineと改番保留ルールを作る

**Files:**
- Create: `web/src/lib/law-refresh/diff-law-revisions.ts`
- Create: `web/src/__tests__/law-refresh-diff.test.ts`

**Interfaces:**
- Consumes: `ParsedLawNode` from Task 2
- Produces: `diffLawRevisions(previous, candidate): LawRevisionDiff`
- Produces: `LawNodeDiffKind = "unchanged" | "modified" | "added" | "removed" | "renumbered_candidate" | "ambiguous"`

- [ ] **Step 1: 挿入・変更・削除・改番候補の失敗テストを書く**

```typescript
it("挿入で後続条文をunchangedに保つ", () => {
  const diff = diffLawRevisions(
    parsed([article("10", "A"), article("11", "B")]),
    parsed([article("10", "A"), article("10の2", "NEW"), article("11", "B")]),
  );
  expect(diff.counts).toEqual({ unchanged: 2, modified: 0, added: 1, removed: 0, held: 0 });
  expect(diff.publishable).toBe(true);
});

it("本文同一で条番号だけが変わった候補は自動公開しない", () => {
  const diff = diffLawRevisions(
    parsed([article("10", "same body")]),
    parsed([article("12", "same body")]),
  );
  expect(diff.items.map((item) => item.kind)).toContain("renumbered_candidate");
  expect(diff.publishable).toBe(false);
  expect(diff.holdReasons).toContain("RENUMBERING_REVIEW_REQUIRED");
});
```

- [ ] **Step 2: module未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-diff.test.ts`

Expected: import error。

- [ ] **Step 3: key/checksumの二段階diffを実装する**

```typescript
export interface LawRevisionDiff {
  items: LawNodeDiff[];
  counts: {
    unchanged: number;
    modified: number;
    added: number;
    removed: number;
    held: number;
  };
  publishable: boolean;
  holdReasons: string[];
}
```

同じ `durableNodeKey` は `contentChecksum` でunchanged/modifiedに分ける。旧版だけ・新版だけのnodeは一度removed/added候補とし、同一親の `level + bodyChecksum` が一致する組を `renumbered_candidate` に昇格させる。候補が複数なら `ambiguous`。どちらも `publishable=false` とする。

- [ ] **Step 4: 差分テストを通す**

Run: `cd web && npx vitest run src/__tests__/law-refresh-diff.test.ts src/__tests__/law-refresh-parser.test.ts`

Expected: 全PASS。

- [ ] **Step 5: 差分engineをコミットする**

```bash
git add web/src/lib/law-refresh/diff-law-revisions.ts web/src/__tests__/law-refresh-diff.test.ts
git commit -m "feat(refresh): classify article-level revision diffs"
```

---

### Task 5: 候補Revisionの構造と書籍範囲を検証する

**Files:**
- Create: `web/src/lib/law-refresh/range-resolution.ts`
- Create: `web/src/lib/law-refresh/reviewed-mappings.ts`
- Create: `web/src/lib/law-refresh/verify-candidate.ts`
- Create: `web/src/__tests__/law-refresh-range-resolution.test.ts`
- Create: `web/src/__tests__/law-refresh-verifier.test.ts`

**Interfaces:**
- Consumes: `ParsedLawDocument` from Task 2、`LawRevisionDiff` from Task 4
- Produces: `resolveVerifiedRanges(ranges, nodes): RangeResolutionResult[]`
- Produces: `verifyCandidate(input: CandidateVerificationInput): CandidateVerificationReport`
- Produces: `loadReviewedRevisionDecision(path, expected): ReviewedRevisionDecision`

- [ ] **Step 1: 範囲解決不能と親子破損を拒否する失敗テストを書く**

```typescript
it("検証済み民法範囲が候補Revisionにない場合はblockedにする", () => {
  const result = resolveVerifiedRanges(
    [{ id: "range-206", rangeType: "article", officialCitationStart: "第206条", officialCitationEnd: "第206条" }],
    [articleNode("205")],
  );
  expect(result).toEqual([expect.objectContaining({
    rangeId: "range-206",
    status: "blocked",
    errorCode: "VERIFIED_RANGE_NOT_FOUND",
  })]);
});

it("存在しないparentを持つ候補を公開不可にする", () => {
  const report = verifyCandidate({
    document: documentWith([{ ...articleNode("1"), parentSourceIndex: 999 }]),
    diff: publishableDiff(),
    ranges: [],
    previousNodeCount: 1,
  });
  expect(report.publishable).toBe(false);
  expect(report.errors).toContainEqual(expect.objectContaining({ code: "ORPHAN_NODE" }));
});

it("XML checksumが一致しない人手確認ファイルを拒否する", () => {
  expect(() => parseReviewedRevisionDecision({
    schemaVersion: 1,
    lawId: "law-1",
    fromRevisionId: "rev-1",
    toRevisionId: "rev-2",
    fromXmlChecksum: "a".repeat(64),
    toXmlChecksum: "b".repeat(64),
    mappings: [],
    approvedGuards: ["STRUCTURE_CHANGE_REVIEW_REQUIRED"],
    verifiedBy: "operator",
    verifiedAt: "2026-08-04T09:00:00+09:00",
    rationale: "公式XML差分を確認した",
  }, {
    lawId: "law-1",
    fromRevisionId: "rev-1",
    toRevisionId: "rev-2",
    fromXmlChecksum: "a".repeat(64),
    toXmlChecksum: "c".repeat(64),
  })).toThrowError(expect.objectContaining({ code: "REVIEW_CHECKSUM_MISMATCH" }));
});
```

- [ ] **Step 2: module未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-range-resolution.test.ts src/__tests__/law-refresh-verifier.test.ts`

Expected: import error。

- [ ] **Step 3: 引用範囲resolverを実装する**

```typescript
export interface RangeResolutionResult {
  rangeId: string;
  status: "resolved" | "blocked";
  startDurableNodeKey: string | null;
  endDurableNodeKey: string | null;
  errorCode: string | null;
}
```

`officialCitationStart/End` を既存の条番号正規化関数で `206`、`213の2` の形式へ変換し、`level="article"` の候補nodeへ完全一致させる。0件または複数件ならblocked。`entire_document` はroot全体としてresolved。元の `LawBookEntryRange.startStableNodeKey/endStableNodeKey` は更新しない。

reviewed decision JSONは次のexact schemaにする。

```typescript
export interface ReviewedRevisionDecision {
  schemaVersion: 1;
  lawId: string;
  fromRevisionId: string;
  toRevisionId: string;
  fromXmlChecksum: string;
  toXmlChecksum: string;
  mappings: Array<{
    fromDurableNodeKey: string;
    toDurableNodeKey: string;
    kind: "renumbered";
    rationale: string;
  }>;
  approvedGuards: Array<"STRUCTURE_CHANGE_REVIEW_REQUIRED">;
  verifiedBy: string;
  verifiedAt: string;
  rationale: string;
}
```

Revision pair、両XML checksum、law IDが候補と完全一致し、すべてのrenumbered/ambiguous候補が一意なmappingで覆われた場合だけ保留を解除する。review file自体はmanifestへ含める。

- [ ] **Step 4: verifierを実装する**

```typescript
export interface CandidateVerificationReport {
  publishable: boolean;
  errors: Array<{ code: string; nodeKey?: string; detail: string }>;
  warnings: Array<{ code: string; detail: string }>;
  rangeResolutions: RangeResolutionResult[];
  metrics: { nodeCount: number; articleCount: number; nodeDeltaRatio: number };
}
```

次を順番に検査する: node 1件以上、durable key一意、parent存在、循環なし、同一親・同一level・同一公式番号の重複なし、diffがpublishable、検証済み範囲が全resolved。node件数が旧版から20%以上減少または増加した場合は `STRUCTURE_CHANGE_REVIEW_REQUIRED` で保留し、恒久拒否にはしない。

- [ ] **Step 5: resolver/verifierテストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-range-resolution.test.ts src/__tests__/law-refresh-verifier.test.ts
npx tsc --noEmit
```

Expected: 全PASS。

- [ ] **Step 6: 検証ゲートをコミットする**

```bash
git add web/src/lib/law-refresh/range-resolution.ts web/src/lib/law-refresh/reviewed-mappings.ts web/src/lib/law-refresh/verify-candidate.ts web/src/__tests__/law-refresh-range-resolution.test.ts web/src/__tests__/law-refresh-verifier.test.ts
git commit -m "feat(refresh): gate revision activation on structure checks"
```

---

### Task 6: 更新manifestを署名し、秘密鍵をGit管理外で生成する

**Files:**
- Create: `web/src/lib/law-refresh/package-signer.ts`
- Create: `web/scripts/generate-law-package-signing-key.ts`
- Create: `web/src/__tests__/law-refresh-package-signer.test.ts`
- Modify: `.gitignore`
- Modify: `web/.env.example`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `signRefreshManifest(manifest, key, signerKeyId): SignedRefreshManifest`
- Produces: `verifyRefreshManifest(signed, publicKey): boolean`
- Environment: `LAW_PACKAGE_SIGNING_KEY_PATH`, `LAW_PACKAGE_SIGNER_KEY_ID`

- [ ] **Step 1: canonical manifestの署名改ざん検知テストを書く**

```typescript
it("同じmanifestは同じchecksumになり改ざんは検証失敗する", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signed = signRefreshManifest({
    runId: "run-1",
    targetDate: "2026-08-04",
    laws: [{ lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: "a".repeat(64) }],
  }, privateKey, "test-key");

  expect(verifyRefreshManifest(signed, publicKey)).toBe(true);
  expect(verifyRefreshManifest({
    ...signed,
    manifest: { ...signed.manifest, targetDate: "2026-08-05" },
  }, publicKey)).toBe(false);
});
```

- [ ] **Step 2: module未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-package-signer.test.ts`

Expected: import error。

- [ ] **Step 3: canonical JSONとEd25519署名を実装する**

```typescript
export interface SignedRefreshManifest {
  manifest: RefreshManifest;
  manifestChecksum: string;
  signature: string;
  signerKeyId: string;
}
```

object keyを辞書順、array順を入力順のままcanonical JSON化し、SHA-256 checksumを計算する。`node:crypto` のEd25519でchecksum bytesを署名し、signatureはbase64にする。鍵未設定時は `SIGNING_KEY_MISSING`、読取不能時は `SIGNING_KEY_INVALID` を返し、更新を有効化しない。

- [ ] **Step 4: 鍵生成CLIと秘密ファイル除外を追加する**

CLIは次の引数契約にする。

```text
npm run lawbook:current:keygen -- --out ../.secrets/law-package-ed25519.pem --public-out ../.secrets/law-package-ed25519.pub.pem
```

既存ファイルがある場合は上書きせず非0終了する。private keyはmode `0600` で保存する。`.gitignore` へ `.secrets/` を追加し、`.env.example` には実値を入れない。

- [ ] **Step 5: signerテストと鍵生成smokeを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-package-signer.test.ts
BLRA_KEYGEN_DIR=$(mktemp -d)
npx tsx scripts/generate-law-package-signing-key.ts --out "$BLRA_KEYGEN_DIR/private.pem" --public-out "$BLRA_KEYGEN_DIR/public.pem"
test -s "$BLRA_KEYGEN_DIR/private.pem"
test -s "$BLRA_KEYGEN_DIR/public.pem"
```

Expected: テストPASS、鍵2ファイルが非空、private keyのmodeが所有者読書きのみ。

- [ ] **Step 6: signerをコミットする**

```bash
git add .gitignore web/.env.example web/package.json web/src/lib/law-refresh/package-signer.ts web/scripts/generate-law-package-signing-key.ts web/src/__tests__/law-refresh-package-signer.test.ts
git commit -m "feat(refresh): sign immutable refresh manifests"
```

---

### Task 7: Revisionをステージングし、法令単位で原子的に切り替えるrepositoryを作る

**Files:**
- Create: `web/src/lib/law-refresh/refresh-repository.ts`
- Create: `web/src/__tests__/integration/current-law-refresh-fixture.ts`
- Create: `web/src/__tests__/integration/current-law-refresh-repository.test.ts`

**Interfaces:**
- Consumes: signed manifest from Task 6、parsed nodes from Task 2、mapping/diff from Task 4、range resolutions from Task 5
- Produces: `createRefreshRun(input): Promise<LawRefreshRunRecord>`
- Produces: `stageCandidateRevision(input): Promise<StagedRevision>`
- Produces: `activateCandidateRevision(input): Promise<void>`
- Produces: `recordHeldCandidate(input): Promise<void>`
- Produces: `recordUnchangedCheck(input): Promise<void>`、`recordFailedCheck(input): Promise<void>`
- Produces: `withRefreshLock<T>(work: () => Promise<T>): Promise<T>`

```typescript
export interface LawRefreshRunRecord {
  id: string;
  targetDate: string;
  trigger: "scheduled" | "manual";
  status: "running" | "succeeded" | "partial" | "failed";
}
```

- [ ] **Step 1: staged Revisionが公開されず、activateだけがpointerを変える失敗テストを書く**

```typescript
it("検証済み候補だけを1トランザクションでcurrentへ切り替える", async () => {
  const fixture = await createCurrentLawRefreshFixture(prisma);
  const staged = await repository.stageCandidateRevision(fixture.candidateInput);

  expect(await currentRevisionId(fixture.lawId)).toBe(fixture.oldRevisionId);
  await repository.activateCandidateRevision({
    lawId: fixture.lawId,
    previousRevisionId: fixture.oldRevisionId,
    candidateRevisionId: staged.revisionId,
    runResultId: fixture.runResultId,
    mappings: staged.mappings,
    rangeResolutions: staged.rangeResolutions,
    sync: fixture.syncMetadata,
  });

  expect(await currentRevisionId(fixture.lawId)).toBe(staged.revisionId);
  expect(await revisionStatus(fixture.oldRevisionId)).toBe("superseded");
  expect(await revisionStatus(staged.revisionId)).toBe("active");
});
```

- [ ] **Step 2: 競合または途中失敗で旧pointerを維持する失敗テストを書く**

```typescript
it("previousRevisionIdが変わっていたら切替を拒否する", async () => {
  const fixture = await createCurrentLawRefreshFixture(prisma);
  const staged = await repository.stageCandidateRevision(fixture.candidateInput);
  await prisma.law.update({ where: { id: fixture.lawId }, data: { currentRevisionId: fixture.otherRevisionId } });

  await expect(repository.activateCandidateRevision({
    ...fixture.activationInput,
    candidateRevisionId: staged.revisionId,
  })).rejects.toMatchObject({ code: "CURRENT_REVISION_CHANGED" });
  expect(await revisionStatus(staged.revisionId)).toBe("staged");
});

it("同時更新lockを取得できない2本目を拒否する", async () => {
  const first = repository.withRefreshLock(() => deferred.promise);
  await expect(repository.withRefreshLock(async () => "second"))
    .rejects.toMatchObject({ code: "REFRESH_ALREADY_RUNNING" });
  deferred.resolve("first");
  await expect(first).resolves.toBe("first");
});
```

- [ ] **Step 3: repository未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/current-law-refresh-repository.test.ts`

Expected: import error。

- [ ] **Step 4: staging書込みを実装する**

`stageCandidateRevision` は同じ `(lawId, officialVersionKey)` があればchecksum一致を確認して再利用し、不一致なら `OFFICIAL_VERSION_CHECKSUM_CONFLICT`。新規時はID `rev_<officialVersionKey>` の `LawRevision(status=staged)`、Revision固有Article、Revision間mapping、範囲解決をtransactionで作る。Article IDは `art_<egovLawId小文字>_<revision checksum先頭12>_<sourceIndexを6桁>` とし、durable keyには含めない。run package IDは `pkg_current_<runId>` とする。署名済みmanifest checksum、signature、signer key IDを同じ `LawPackage(status=verified)` に保存し、runの `packageId` とcandidate Revisionの `packageId` を一致させる。run完了時に更新成功が1件以上ならpackageをpublished、候補がすべて拒否ならrejectedにする。

- [ ] **Step 5: activationのcompare-and-swapを実装する**

```typescript
const changed = await tx.law.updateMany({
  where: { id: input.lawId, currentRevisionId: input.previousRevisionId },
  data: { currentRevisionId: input.candidateRevisionId },
});
if (changed.count !== 1) throw new CurrentRevisionChangedError();
```

同じtransaction内でcandidateをactive、previousをsuperseded、run resultをupdated/completed、`LawSyncState` を成功値へupsertする。失敗記録は内部詳細をDBへ保存するが、公開DTOへはerror codeだけを出す。

`recordUnchangedCheck` は `lastAttemptAt/lastSuccessfulCheckAt/lastObservedVersionKey/lastEgovUpdatedAt` を更新して既存errorを消す。`recordFailedCheck` は `lastAttemptAt/lastErrorCode/lastErrorDetail` だけを更新し、最後の成功日時とcurrent pointerを維持する。`withRefreshLock` は固定advisory lock keyを同じDB connectionで取得・解放し、process終了時もconnection cleanupを行う。

- [ ] **Step 6: repository統合テストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/integration/current-law-refresh-repository.test.ts
npx tsc --noEmit
```

Expected: 全PASS、fixture cleanup後にテスト用law/run/package/article/mapping/range resolutionが0件。

- [ ] **Step 7: repositoryをコミットする**

```bash
git add web/src/lib/law-refresh/refresh-repository.ts web/src/__tests__/integration/current-law-refresh-fixture.ts web/src/__tests__/integration/current-law-refresh-repository.test.ts
git commit -m "feat(refresh): activate verified revisions atomically"
```

---

### Task 8: 120法令の確認・差分更新serviceとCLIを作る

**Files:**
- Create: `web/src/lib/law-refresh/refresh-service.ts`
- Create: `web/scripts/refresh-current-laws.ts`
- Create: `web/src/__tests__/law-refresh-service.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: Task 2〜7のparser/client/store/diff/verifier/signer/repository
- Produces: `refreshCurrentLaws(request, deps): Promise<RefreshRunReport>`
- CLI: `lawbook:current:check`、`lawbook:current:refresh`

- [x] **Step 1: 無変更法令ではXMLを取得しない失敗テストを書く**

```typescript
it("公式版番号が一致する法令はmetadata確認だけで終了する", async () => {
  const deps = fakeRefreshDeps({ localRevision: "rev-1", observedRevision: "rev-1" });
  const report = await refreshCurrentLaws({
    asOf: "2026-08-04",
    trigger: "manual",
    mode: "refresh",
    lawIds: ["325AC0000000201"],
  }, deps);

  expect(report.counts).toEqual({ checked: 1, unchanged: 1, updated: 0, held: 0, failed: 0 });
  expect(deps.getLawXmlAt).not.toHaveBeenCalled();
  expect(deps.stageCandidateRevision).not.toHaveBeenCalled();
});
```

- [x] **Step 2: 1法令失敗でも他法令を更新する失敗テストを書く**

```typescript
it("検証保留を法令内に閉じ込める", async () => {
  const deps = fakeTwoLawRefreshDeps({ first: "held", second: "updated" });
  const report = await refreshCurrentLaws({
    asOf: "2026-08-04",
    trigger: "scheduled",
    mode: "refresh",
    lawIds: ["law-a", "law-b"],
  }, deps);

  expect(report.counts).toMatchObject({ checked: 2, updated: 1, held: 1, failed: 0 });
  expect(deps.activateCandidateRevision).toHaveBeenCalledTimes(1);
});

it("廃止状態でも既存Revisionを削除せず同期状態へ廃止日を記録する", async () => {
  const deps = fakeRefreshDeps({
    localRevision: "rev-last",
    observedRevision: "rev-last",
    repealStatus: "Repeal",
    repealDate: "2026-08-04",
  });
  await refreshCurrentLaws({
    asOf: "2026-08-04",
    trigger: "manual",
    mode: "refresh",
    lawIds: ["law-repealed"],
  }, deps);
  expect(deps.deleteRevision).toBeUndefined();
  expect(deps.recordUnchangedCheck).toHaveBeenCalledWith(
    expect.objectContaining({ repealStatus: "Repeal", repealDate: "2026-08-04" }),
  );
});
```

- [x] **Step 3: service未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-service.test.ts`

Expected: import error。

- [x] **Step 4: serviceを依存注入可能な形で実装する**

```typescript
export interface RefreshCurrentLawsRequest {
  asOf: string;
  trigger: "scheduled" | "manual";
  mode: "check" | "dry-run" | "refresh";
  lawIds?: string[];
}

export interface RefreshRunReport {
  runId: string;
  asOf: string;
  counts: { checked: number; unchanged: number; updated: number; held: number; failed: number };
  laws: Array<{
    lawId: string;
    status: "unchanged" | "updated" | "held" | "failed";
    from: string | null;
    to: string | null;
    errorCode: string | null;
  }>;
}
```

対象はrequest指定がなければ `LAW_BOOK_2026` の120件。run全体を `withRefreshLock` で囲む。e-Gov照会は8並列、429/5xxだけ最大3回指数backoffする。`check` はmetadata比較と同期状態の記録だけ、`dry-run` は取得・parse・diff・verifyまででDB候補/Article/pointerを書かない、`refresh` だけ署名・stage・activateする。unchangedは `recordUnchangedCheck`、取得失敗は `recordFailedCheck` を呼ぶ。廃止状態は `LawSyncState.repealStatus/repealDate` へ保存し、Article、Revision、current pointerを物理削除しない。法令ごとの例外を公開error codeへ変換して次法令へ進む。

- [x] **Step 5: CLI引数と終了コードを実装する**

```text
npm run lawbook:current:check -- --asof 2026-08-04
npm run lawbook:current:refresh -- --asof 2026-08-04 --dry-run
npm run lawbook:current:refresh -- --asof 2026-08-04 --law 325AC0000000201
npm run lawbook:current:refresh -- --asof 2026-08-04 --review-dir config/law-refresh-mappings --json
```

`--asof` 省略時はAsia/Tokyoの当日。`--review-dir` は存在するRevision pairのJSONだけをTask 5の厳格schemaで読む。`--json` はstdoutを `RefreshRunReport` 1個のJSONに限定し、進捗はstderrへ出す。未知law ID、未来日、同時実行lock取得失敗、全法令check失敗は非0終了。部分保留はreportを出してexit code 2、全成功/無変更は0とする。

- [x] **Step 6: serviceテストとCLI helpを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-service.test.ts
npm run lawbook:current:check -- --help
npx tsc --noEmit
```

Expected: 全PASS、helpに `--asof --law --dry-run --review-dir --json` が表示される。

- [x] **Step 7: service/CLIをコミットする**

```bash
git add web/src/lib/law-refresh/refresh-service.ts web/scripts/refresh-current-laws.ts web/src/__tests__/law-refresh-service.test.ts web/package.json
git commit -m "feat(refresh): orchestrate per-law current updates"
```

---

### Task 9: 現在の120法令へdurable keyと範囲解決を安全にbackfillする

**Files:**
- Create: `web/scripts/backfill-current-law-durable-keys.ts`
- Create: `web/scripts/verify-current-laws.ts`
- Create: `web/src/__tests__/law-refresh-backfill.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `ParsedLawNode.legacyStableNodeKey` and `durableNodeKey` from Task 2
- Produces: `planDurableKeyBackfill(dbNodes, parsedNodes): DurableKeyBackfillPlan`
- CLI: `lawbook:current:backfill`、`lawbook:current:verify`

- [ ] **Step 1: checksum不一致なら書き込まない失敗テストを書く**

```typescript
it("既存nodeと公式XMLのchecksumが1件でも違えば法令全体を拒否する", () => {
  expect(() => planDurableKeyBackfill(
    [{ id: "article-1", stableNodeKey: "root/article:1@1", contentChecksum: "db" }],
    [{ legacyStableNodeKey: "root/article:1@1", durableNodeKey: "main/article:1", contentChecksum: "xml" }],
  )).toThrowError(expect.objectContaining({ code: "BACKFILL_CHECKSUM_MISMATCH" }));
});
```

- [ ] **Step 2: backfill module未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-refresh-backfill.test.ts`

Expected: import error。

- [ ] **Step 3: backfill計画とCLIを実装する**

各 `Law.currentRevisionId` の `LawRevision.xmlStorageKey` から原本を読み、同じRevision IDでparseする。既存Articleとparser nodeを `legacyStableNodeKey` で1対1照合し、件数、`contentChecksum`、親子数がすべて一致した法令だけ更新対象にする。

dry-run出力は次の形に固定する。

```typescript
export interface DurableKeyBackfillReport {
  lawsChecked: number;
  lawsReady: number;
  lawsBlocked: number;
  nodesReady: number;
  blocked: Array<{ lawId: string; errorCode: string }>;
}
```

本実行は法令ごとのtransactionで `Article.durableNodeKey/bodyChecksum` と、現在の検証済み `LawBookEntryRange` に対応する `LawBookEntryRangeResolution` を保存する。未検証の105抄録へ範囲を作らない。

- [ ] **Step 4: 現行版verifierを実装する**

`verify-current-laws.ts` は次を非0終了条件にする: 収録対象が120でない、currentRevisionId欠損、current Revisionのactive Articleが0、durable key欠損/重複、検証済みRangeのresolution欠損、ArticleのlawIdとRevisionのlawId不一致。`--online` のときだけe-Gov版番号照合も行う。

- [ ] **Step 5: 単体テストとdry-runを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-refresh-backfill.test.ts
npm run lawbook:current:backfill -- --dry-run
```

Expected: `lawsChecked=120 lawsBlocked=0`。1件でもblockedなら本実行へ進まない。

- [ ] **Step 6: DBバックアップ後にbackfillし、現行版verifierを通す**

Run:

```bash
cd web
set -a
source .env
set +a
BLRA_BACKFILL_BACKUP=../../blra-backups/hourei_rag-before-durable-key-backfill.dump
pg_dump "$DATABASE_URL" --format=custom --file "$BLRA_BACKFILL_BACKUP"
pg_restore --list "$BLRA_BACKFILL_BACKUP" >/dev/null
npm run lawbook:current:backfill
npm run lawbook:current:verify
```

Expected: 120法令すべて成功し、検証済み民法61範囲がcurrent Revisionへresolved。

- [ ] **Step 7: backfill/verifierをコミットする**

```bash
git add web/scripts/backfill-current-law-durable-keys.ts web/scripts/verify-current-laws.ts web/src/__tests__/law-refresh-backfill.test.ts web/package.json
git commit -m "feat(refresh): backfill durable current-law identities"
```

---

### Task 10: 固定書籍版の保守コマンドが現行Revisionを巻き戻さないようにする

**Files:**
- Create: `web/src/lib/law-book/catalog-maintenance.ts`
- Create: `web/src/__tests__/law-book-current-compatibility.test.ts`
- Modify: `web/scripts/seed-law-book.ts`
- Modify: `web/scripts/ingest.ts`
- Modify: `web/scripts/verify-law-book.ts`
- Modify: `web/scripts/lib/enforce-law-book-scope.ts`

**Interfaces:**
- Produces: `catalogRevisionForIngest(entryRevisionId): string`
- Produces: `shouldInitializeCurrentRevision(currentRevisionId): boolean`
- Invariant: catalog seed/verify/scopeは非収録lawを除き `Law.currentRevisionId` を変更しない

- [x] **Step 1: catalog再実行でcurrentを旧版へ戻さない失敗テストを書く**

```typescript
it("currentが既にあれば書籍baselineで初期化し直さない", () => {
  expect(shouldInitializeCurrentRevision("rev-current")).toBe(false);
  expect(shouldInitializeCurrentRevision(null)).toBe(true);
});

it("catalog ingestはcurrentではなくEntryの固定Revisionを対象にする", () => {
  expect(catalogRevisionForIngest("rev-ksk-2026")).toBe("rev-ksk-2026");
});
```

- [x] **Step 2: 現行seed/ingestのcurrent依存を示すテストまたはsource assertionが失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/law-book-current-compatibility.test.ts`

Expected: module未作成でFAIL。

- [x] **Step 3: seed/ingest/scopeをcatalog責務へ限定する**

`seed-law-book.ts` は `LawBookEntry.lawRevisionId` のbaseline作成・検証だけを行い、`Law.currentRevisionId` がnullの初期導入時だけ設定する。`ingest.ts` は `ksk-2026` EntryのRevisionへArticleを投入し、law全体のcurrent Article存在数ではなく対象Revisionの存在数で冪等判定する。`enforceLawBookScope` は収録外lawだけを非公開化し、収録120法令のcurrent pointerとcurrent ArticleをEntry Revision不一致の理由で変更しない。

- [x] **Step 4: 固定版verifierを新しい責務へ更新する**

`verify-law-book.ts` はEntry baselineの120件、原本checksum、baseline Article、民法61範囲を検査し、`Entry.lawRevisionId === Law.currentRevisionId` を要求しない。公開currentの検査はTask 9のverifierへ委譲する。

- [x] **Step 5: catalog/current互換テストと固定版verifyを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/law-book-current-compatibility.test.ts src/__tests__/integration/law-book-scope.test.ts
npm run lawbook:verify
npx tsc --noEmit
```

Expected: 全PASS、catalog verifierとcurrent verifierの責務が重複しない。

- [x] **Step 6: catalog保護をコミットする**

```bash
git add web/src/lib/law-book/catalog-maintenance.ts web/src/__tests__/law-book-current-compatibility.test.ts web/scripts/seed-law-book.ts web/scripts/ingest.ts web/scripts/verify-law-book.ts web/scripts/lib/enforce-law-book-scope.ts
git commit -m "fix(refresh): keep catalog maintenance revision-safe"
```

---

### Task 11: 法令一覧・本文・目次・検索をcurrentRevisionへ切り替える

**Files:**
- Create: `web/src/lib/law-book/current-scope.ts`
- Create: `web/src/__tests__/integration/current-law-read-scope.test.ts`
- Modify: `web/src/lib/law-book/sql-scope.ts`
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/api/laws/route.ts`
- Modify: `web/src/app/api/law-toc/route.ts`
- Modify: `web/src/app/api/articles/by-number/route.ts`
- Modify: `web/src/app/api/articles/preview/route.ts`
- Modify: `web/src/app/api/articles/chapter-window/route.ts`
- Modify: `web/src/app/api/search/route.ts`
- Modify: `web/src/app/api/search/suggest/route.ts`
- Modify: `web/src/lib/article/article.ts`
- Modify: `web/src/lib/article/chapter-window.ts`
- Modify: `web/src/lib/article/full-law-repository.ts`
- Modify: `web/scripts/bench-search.ts`

**Interfaces:**
- Produces: `currentLawBookArticleScopeSql(articleAlias, entryAlias, lawAlias): string`
- Keeps: `lawBookCatalogArticleScopeSql(articleAlias, entryAlias): string` for fixed `ksk-2026` verification
- Public invariant: `Article.lawRevisionId = Law.currentRevisionId`

- [x] **Step 1: Entryが旧版を指していても公開本文はcurrentだけを返す失敗テストを書く**

```typescript
it("書籍Entryの固定RevisionではなくLaw.currentRevisionを公開する", async () => {
  const fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
  expect(fixture.entryRevisionId).toBe(fixture.oldRevisionId);

  const current = await getFullLawDocument(fixture.candidateRevisionId);
  const old = await getFullLawDocument(fixture.oldRevisionId);

  expect(current?.revision.id).toBe(fixture.candidateRevisionId);
  expect(current?.nodes.map((node) => node.lawRevisionId)).toEqual(
    expect.arrayContaining([fixture.candidateRevisionId]),
  );
  expect(old).toBeNull();
});
```

同じfixtureで `/api/laws` 相当repositoryの `firstArticleId` がcandidate Article、検索結果に旧Articleが0件であることもassertする。

- [x] **Step 2: 現行実装が旧Entry Revisionを返して失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/current-law-read-scope.test.ts`

Expected: current documentがnull、またはfirstArticleIdが旧ArticleとなりFAIL。

- [x] **Step 3: catalog scopeとcurrent scopeを分離する**

```typescript
export function currentLawBookArticleScopeSql(
  articleAlias: string,
  entryAlias: string,
  lawAlias: string,
): string {
  assertSafeSqlAlias(articleAlias);
  assertSafeSqlAlias(entryAlias);
  assertSafeSqlAlias(lawAlias);
  return `(
    ${articleAlias}."lawId" = ${lawAlias}.id
    AND ${articleAlias}."lawRevisionId" = ${lawAlias}."currentRevisionId"
    AND ${articleAlias}."deletedAt" IS NULL
    AND (
      ${entryAlias}."inclusionMode" = 'full'
      OR ${entryAlias}."verifiedAt" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "LawBookEntryRangeResolution" resolution
        JOIN "LawBookEntryRange" included_range
          ON included_range.id = resolution."lawBookEntryRangeId"
        WHERE included_range."lawBookEntryId" = ${entryAlias}.id
          AND resolution."lawRevisionId" = ${lawAlias}."currentRevisionId"
          AND resolution.status = 'resolved'
          AND (
            resolution."startDurableNodeKey" IS NULL
            OR ${articleAlias}."durableNodeKey" = resolution."startDurableNodeKey"
            OR ${articleAlias}."durableNodeKey" LIKE resolution."startDurableNodeKey" || '/%'
          )
      )
    )
  )`;
}
```

既存 `lawBookArticleScopeSql` は `lawBookCatalogArticleScopeSql` へ改名して固定書籍版検証だけに残す。Task 12で全consumerを分類し終えるまでは、型検査を壊さないdeprecated aliasとして旧名をexportする。

- [x] **Step 4: reader/list/search系SQLの結合条件を更新する**

全対象で `LawBookEntry` は `(editionId, lawId)` のカタログ所属だけを表し、`e.lawRevisionId = a.lawRevisionId` を削除する。Article選択には必ず `a.lawRevisionId = l.currentRevisionId` と `currentLawBookArticleScopeSql(...)` を入れる。`getFullLawDocument(id)` は指定RevisionがそのLawのcurrentでない場合nullを返す。

`bench-search.ts` も同じcurrent scope helperを使い、固定Entry Revisionではなく公開currentを測定する。

- [x] **Step 5: read scope統合テストと既存reader/searchテストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/integration/current-law-read-scope.test.ts src/__tests__/integration/full-law-document.test.ts src/__tests__/integration/search-smoke.test.ts src/__tests__/integration/chapter-window-api.test.ts
npm run bench:search
npx tsc --noEmit
```

Expected: 全PASS。

- [x] **Step 6: 公開read scopeをコミットする**

```bash
git add web/src/lib/law-book/current-scope.ts web/src/lib/law-book/sql-scope.ts web/src/app/page.tsx web/src/app/api/laws/route.ts web/src/app/api/law-toc/route.ts web/src/app/api/articles/by-number/route.ts web/src/app/api/articles/preview/route.ts web/src/app/api/articles/chapter-window/route.ts web/src/app/api/search/route.ts web/src/app/api/search/suggest/route.ts web/src/lib/article/article.ts web/src/lib/article/chapter-window.ts web/src/lib/article/full-law-repository.ts web/scripts/bench-search.ts web/src/__tests__/integration/current-law-read-scope.test.ts
git commit -m "refactor(reader): read verified current law revisions"
```

---

### Task 12: リンク・エクスポート・適用時点・確認済み関係をcurrent境界へそろえる

**Files:**
- Create: `web/src/__tests__/integration/current-law-dependent-scope.test.ts`
- Modify: `web/src/lib/link/link.ts`
- Modify: `web/src/lib/link/link-detector.ts`
- Modify: `web/src/app/api/export/route.ts`
- Modify: `web/src/lib/practice/export-validator.ts`
- Modify: `web/src/lib/applicability/resolve-applicable-article.ts`
- Modify: `web/src/lib/relations/confirmed-relations-repository.ts`
- Modify: `web/src/lib/relations/confirmed-relation-service.ts`
- Modify: `web/src/lib/law-book/sql-scope.ts`
- Modify: `web/scripts/verify-law-book.ts`
- Modify: `web/src/__tests__/integration/law-book-scope.test.ts`
- Modify: `web/src/__tests__/integration/export-import-smoke.test.ts`
- Modify: `web/src/__tests__/integration/confirmed-relation-service.test.ts`

**Interfaces:**
- Consumes: `currentLawBookArticleScopeSql` from Task 11
- Public invariant: current sourceからcurrent targetへのLinkだけを解決済みとして返す
- Snapshot invariant: `snapshotLawRevisionId` 指定時だけ過去Revisionを明示的に解決する

- [ ] **Step 1: 旧RevisionのLinkと確認済み関係が現行版へ漏れない失敗テストを書く**

```typescript
it("旧Revisionだけにある関係をcurrent文書へ返さない", async () => {
  const fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
  await createConfirmedRelationOnRevision(fixture.oldRevisionId);

  const relations = await getConfirmedRelationsForRevision(fixture.candidateRevisionId);
  expect(relations).toEqual([]);
});

it("current exportに旧Revision Articleを含めない", async () => {
  const fixture = await createCurrentLawRefreshFixture(prisma, { activateCandidate: true });
  const ids = await collectExportArticleIds(fixture.lawId);
  expect(ids).toContain(fixture.candidateArticleId);
  expect(ids).not.toContain(fixture.oldArticleId);
});
```

- [ ] **Step 2: 現行実装が旧Entry境界を使って失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/current-law-dependent-scope.test.ts`

Expected: 旧Articleまたは旧関係が結果へ含まれてFAIL。

- [ ] **Step 3: 派生データのsource/target条件をcurrentへ変更する**

Link SQLはsourceとtargetのそれぞれについて、カタログ所属する `LawBookEntry` と `Law.currentRevisionId` を結合する。targetがcurrentでないLinkは `isResolved=true` でも公開しない。変更法令の再構築時は、その法令をsourceに持つLinkとtarget候補に持つincoming Linkを削除・再抽出し、他法令同士のLinkには触れない。

- [ ] **Step 4: snapshot明示とcurrent既定を分離する**

`resolveApplicableArticle` は `snapshotLawRevisionId` がある場合だけそのRevisionを使い、ない場合は `Law.currentRevisionId` を使う。エクスポート、入力検証、確認済み関係はcurrentを既定とし、旧Revisionの関係を新Revisionへコピーしない。checksum変更を検知した確認済み関係は既存の失効理由 `REVISION_CONTENT_CHANGED` で無効化する。

`verify-law-book.ts` は `lawBookCatalogArticleScopeSql` を明示して固定baselineだけを検査する。全consumerの移行後に `lawBookArticleScopeSql` のdeprecated aliasを削除する。

- [ ] **Step 5: dependent scopeと既存関係テストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/integration/current-law-dependent-scope.test.ts src/__tests__/integration/law-book-scope.test.ts src/__tests__/integration/export-import-smoke.test.ts src/__tests__/integration/confirmed-relation-service.test.ts src/__tests__/resolve-applicable-article.test.ts
npx tsc --noEmit
```

Expected: 全PASS。

- [ ] **Step 6: 固定Entry Revisionを公開条件にしている残存箇所を監査する**

Run:

```bash
cd web
rg -n '"lawRevisionId" = .*entry|entry\."lawRevisionId"|e\."lawRevisionId"' src
```

Expected: 固定書籍版検証、履歴表示、migration用コード以外は0件。公開API/reader/search/link/exportから検出された場合は同じtask内でcurrent helperへ置換して再テストする。

- [ ] **Step 7: dependent scopeをコミットする**

```bash
git add web/src/lib/link/link.ts web/src/lib/link/link-detector.ts web/src/app/api/export/route.ts web/src/lib/practice/export-validator.ts web/src/lib/applicability/resolve-applicable-article.ts web/src/lib/relations/confirmed-relations-repository.ts web/src/lib/relations/confirmed-relation-service.ts web/src/lib/law-book/sql-scope.ts web/scripts/verify-law-book.ts web/src/__tests__/integration/current-law-dependent-scope.test.ts web/src/__tests__/integration/law-book-scope.test.ts web/src/__tests__/integration/export-import-smoke.test.ts web/src/__tests__/integration/confirmed-relation-service.test.ts
git commit -m "fix(refresh): isolate current revision derived data"
```

---

### Task 13: 旧URLを現行条文へ転送し、削除条文は旧本文を表示する

**Files:**
- Create: `web/src/lib/law-refresh/article-successor.ts`
- Create: `web/src/components/article/HistoricalArticleNotice.tsx`
- Create: `web/src/__tests__/article-successor.test.ts`
- Create: `web/src/__tests__/integration/current-law-old-url.test.ts`
- Modify: `web/src/app/articles/[id]/page.tsx`
- Modify: `web/src/lib/article/article.ts`
- Modify: `web/e2e/current-law-refresh.spec.ts`

**Interfaces:**
- Produces: `resolveArticleRoute(articleId: string, repository?: ArticleSuccessorRepository): Promise<ArticleRouteResolution>`
- Produces: `getHistoricalArticleWithTree(articleId: string): Promise<HistoricalArticleDocument | null>`

- [ ] **Step 1: 複数Revisionをまたぐ後継解決と循環拒否の失敗テストを書く**

```typescript
it("rev1からrev3の現行Articleまで対応表をたどる", async () => {
  const resolution = await resolveArticleRoute("article-rev1", fakeRepository({
    currentRevisionId: "rev3",
    mappings: [
      { from: "article-rev1", to: "article-rev2", kind: "modified" },
      { from: "article-rev2", to: "article-rev3", kind: "unchanged" },
    ],
  }));
  expect(resolution).toEqual({ kind: "redirect", articleId: "article-rev3" });
});

it("mapping循環を内部エラーとして拒否する", async () => {
  await expect(resolveArticleRoute("a", fakeRepository({
    currentRevisionId: "rev3",
    mappings: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
  }))).rejects.toMatchObject({ code: "ARTICLE_MAPPING_CYCLE" });
});
```

- [ ] **Step 2: module未作成で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/article-successor.test.ts`

Expected: import error。

- [ ] **Step 3: route resolutionを実装する**

```typescript
export type ArticleRouteResolution =
  | { kind: "current"; articleId: string }
  | { kind: "redirect"; articleId: string }
  | { kind: "removed"; articleId: string; currentLawRevisionId: string }
  | { kind: "historical"; articleId: string; reason: "ambiguous" | "unmapped" }
  | { kind: "missing" };
```

Articleが `Law.currentRevisionId` 所属ならcurrent。確定mappingを最大120hopまでたどり、current所属のtoArticleへ着けばredirect。`removed` またはtoArticleId nullならremoved。mapping未確定ならhistorical。visited setで循環を拒否する。

- [ ] **Step 4: 記事pageへ転送と履歴表示を組み込む**

`page.tsx` は本文取得前にresolutionを求める。redirectは `permanentRedirect(readerArticleHref(articleId))`。removed/historicalは現行scopeを迂回する読み取り専用repositoryから旧Article subtree、法令名、公式版番号、施行日を取得し、`HistoricalArticleNotice` で「削除済み」または「現行条文との対応未確認」を表示する。編集・ハイライト作成操作は出さない。

- [ ] **Step 5: 保存済み利用者データが旧Articleのままである統合テストを書く**

旧ArticleへUserHighlightとArticleAnnotationを作り、後継mapping作成後も両recordの `articleId` と `snapshotLawRevisionId` が変わらないことをassertする。

- [ ] **Step 6: URL/履歴テストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/article-successor.test.ts src/__tests__/integration/current-law-old-url.test.ts
npx tsc --noEmit
```

Expected: 全PASS。

- [ ] **Step 7: 旧URL対応をコミットする**

```bash
git add web/src/lib/law-refresh/article-successor.ts web/src/components/article/HistoricalArticleNotice.tsx web/src/app/articles/'[id]'/page.tsx web/src/lib/article/article.ts web/src/__tests__/article-successor.test.ts web/src/__tests__/integration/current-law-old-url.test.ts web/e2e/current-law-refresh.spec.ts
git commit -m "feat(reader): preserve article URLs across revisions"
```

---

### Task 14: 現行版の施行日・確認状態を表示し、運用手順を固定する

**Files:**
- Create: `web/src/lib/law-book/law-list-client.ts`
- Create: `web/src/__tests__/law-list-client.test.ts`
- Create: `docs/operations/current-law-refresh.md`
- Modify: `web/src/lib/article/full-law-document.ts`
- Modify: `web/src/lib/article/full-law-repository.ts`
- Modify: `web/src/lib/article/full-law-client.ts`
- Modify: `web/src/components/article/FullLawReader.tsx`
- Modify: `web/src/components/toc/TocPanel.tsx`
- Modify: `web/src/app/api/laws/route.ts`
- Modify: `web/src/lib/law-book/law-list.ts`
- Modify: `web/src/__tests__/full-law-client.test.ts`
- Modify: `web/e2e/full-law-reader.spec.ts`
- Modify: `web/e2e/current-law-refresh.spec.ts`
- Modify: `web/scripts/e2e-law-book.ts`
- Modify: `web/.env.example`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `FullLawDocument.revision.effectiveFrom/sourceUpdatedAt/fetchedAt/lastSuccessfulCheckAt/lastAttemptAt/refreshStatus`
- Produces: `/api/laws.corpusVersion`
- Produces: `loadLawList()` with 5-minute revalidation and corpus-version invalidation

- [ ] **Step 1: 固定収録基準日を廃止する失敗テストへ更新する**

`full-law-client.test.ts` のfixtureを次へ変更する。

```typescript
revision: {
  id: "rev-1",
  editionKey: "ksk-2026",
  effectiveFrom: "2026-05-27",
  sourceUpdatedAt: "2026-05-27T10:30:46+09:00",
  fetchedAt: "2026-08-04T04:01:00+09:00",
  lastSuccessfulCheckAt: "2026-08-04T04:00:00+09:00",
  lastAttemptAt: "2026-08-04T04:00:00+09:00",
  refreshStatus: "verified",
  refreshErrorCode: null,
  repealStatus: "None",
  repealDate: null,
}
```

E2Eには次を追加する。

```typescript
await expect(page.getByText("e-Gov現行施行版", { exact: true })).toBeVisible();
await expect(page.getByText(/施行日: 2026-/)).toBeVisible();
await expect(page.getByText(/最終確認:/)).toBeVisible();
await expect(page.getByText(/収録基準日:/)).toHaveCount(0);
```

- [ ] **Step 2: DTO未変更で型検査またはE2E assertionが失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/full-law-client.test.ts`

Expected: `sourceDate` と新fieldの型不一致でFAIL。

- [ ] **Step 3: repository/DTOへ出典と同期状態を追加する**

```typescript
export type LawRefreshDisplayStatus = "verified" | "check_failed" | "never_checked";

export interface FullLawRevisionMetadata {
  id: string;
  editionKey: string;
  effectiveFrom: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
  lastSuccessfulCheckAt: string | null;
  lastAttemptAt: string | null;
  refreshStatus: LawRefreshDisplayStatus;
  refreshErrorCode: string | null;
  repealStatus: string | null;
  repealDate: string | null;
}
```

`LawRevision.effectiveFrom/sourceUpdatedAt/fetchedAt` と `LawSyncState` を取得する。`lastErrorCode` があり `lastAttemptAt > lastSuccessfulCheckAt` ならcheck_failed、成功確認がなければnever_checked、それ以外はverified。内部error detailはDTOへ含めない。

- [ ] **Step 4: running headerを現行版表示へ置換する**

表示文言は次に固定する。

```text
e-Gov現行施行版
施行日: YYYY-MM-DD
e-Gov更新: YYYY-MM-DD HH:mm
最終確認: YYYY-MM-DD HH:mm
```

verifiedだけ見出しを `e-Gov現行施行版` とする。check_failedでは見出しを `最終検証済みe-Gov版` に変えて `更新確認に失敗しました。表示中の版は最終検証済み版です。`、never_checkedでは `e-Gov版（最新確認未完了）` と `e-Govとの最新確認が完了していません。` を表示する。`repealStatus !== "None"` なら `廃止: YYYY-MM-DD` を表示し、一覧でも `廃止` ラベルを付ける。既存のe-Govリンクは維持する。

- [ ] **Step 5: 法令一覧cacheをcorpusVersionで失効させる**

`/api/laws` は120件の `(lawId,currentRevisionId)` を掲載順でSHA-256化した `corpusVersion` を返し、各 `LawListItem` に `repealStatus/repealDate` を含める。`law-list-client.ts` はsession cacheへ `corpusVersion/cachedAt/laws` を保存し、5分を超えたら条件付きfetchする。新しいversionの応答ではmemory/session cacheを置換する。古いfirstArticleIdへ遷移してもTask 13の後継解決が最終防御になる。

`scripts/e2e-law-book.ts` の `LawListApiResponse` に `corpusVersion: string` を追加して非空をassertする。既存の固定Article IDへアクセスする検査は、後継URLへredirectされた最終200本文を検査する。

- [ ] **Step 6: 日次・手動・障害復旧の運用書を書く**

運用書に次の実行例をそのまま載せる。

```cron
CRON_TZ=Asia/Tokyo
0 4 * * * cd /absolute/deployment/path/web && npm run lawbook:current:refresh >> /absolute/log/path/current-law-refresh.log 2>&1
```

さらに、永続 `LAW_XML_STORAGE_DIR`、鍵生成、`check --online`、dry-run、全更新、単一law再試行、exit code 0/2/1、advisory lock、バックアップ復元、公開環境がない間はcronを有効化しないことを記載する。

- [ ] **Step 7: DTO/cache/readerテストを通す**

Run:

```bash
cd web
npx vitest run src/__tests__/full-law-client.test.ts src/__tests__/law-list-client.test.ts src/__tests__/toc-cache.test.ts
npx tsc --noEmit
```

Expected: 全PASS。

- [ ] **Step 8: 表示と運用をコミットする**

```bash
git add web/src/lib/law-book/law-list-client.ts web/src/__tests__/law-list-client.test.ts docs/operations/current-law-refresh.md web/src/lib/article/full-law-document.ts web/src/lib/article/full-law-repository.ts web/src/lib/article/full-law-client.ts web/src/components/article/FullLawReader.tsx web/src/components/toc/TocPanel.tsx web/src/app/api/laws/route.ts web/src/lib/law-book/law-list.ts web/src/__tests__/full-law-client.test.ts web/e2e/full-law-reader.spec.ts web/e2e/current-law-refresh.spec.ts web/scripts/e2e-law-book.ts web/.env.example web/package.json
git commit -m "feat(reader): show verified current-law freshness"
```

---

### Task 15: 初回現行化を実行し、120法令の公開整合を検証する

**Files:**
- Create: `docs/operations/2026-08-current-law-initial-refresh.md`
- Modify only if a verified review decision is required: `web/config/law-refresh-mappings/<from-revision>--<to-revision>.json`

**Interfaces:**
- Consumes: 全実装タスクと `lawbook:current:*` CLI
- Produces: 120法令のオンライン版番号一致、初回run監査記録、実測レポート

- [ ] **Step 1: freshな全テストと作業ツリー境界を確認する**

Run:

```bash
git status --short
npm test
npm run typecheck
cd web
npm test
npx tsc --noEmit
npm run build
```

Expected: 全PASS。`git status` の既存 `AGENTS.md` 以外に未説明の変更がない。

- [ ] **Step 2: 初回更新直前のDBバックアップと署名鍵を準備する**

Run:

```bash
cd web
set -a
source .env
set +a
BLRA_INITIAL_BACKUP=../../blra-backups/hourei_rag-before-initial-current-refresh.dump
pg_dump "$DATABASE_URL" --format=custom --file "$BLRA_INITIAL_BACKUP"
pg_restore --list "$BLRA_INITIAL_BACKUP" >/dev/null
test -n "$LAW_XML_STORAGE_DIR"
test -n "$LAW_PACKAGE_SIGNING_KEY_PATH"
test -n "$LAW_PACKAGE_SIGNER_KEY_ID"
test -s "$LAW_PACKAGE_SIGNING_KEY_PATH"
```

Expected: backup検査0終了、XML保存先と鍵設定が存在する。鍵が未作成ならTask 6のkeygenを一度実行してから再検査する。

- [ ] **Step 3: e-Govオンライン照合をcheck-onlyで行う**

Run:

```bash
cd web
npm run lawbook:current:check -- --json > ../../blra-backups/current-law-check-initial.json
```

Expected: reportの `asOf` がAsia/Tokyoの実行日、`checked=120`、`failed=0`。変更件数は実行日のe-Govを正本とし、2026年8月3日の47件を固定期待値にしない。

- [ ] **Step 4: 全変更法令をdry-runし、保留理由を解消する**

Run:

```bash
cd web
npm run lawbook:current:refresh -- --dry-run --review-dir config/law-refresh-mappings --json > ../../blra-backups/current-law-dry-run-initial.json
```

Expected: `failed=0`。`held>0` の場合は各差分報告と公式XMLを確認し、Task 5のschemaに従うreviewed mapping/guard approval JSONをrevision pairごとに作る。旧key、新key、from/to XML checksum、根拠、確認者、確認日時が完全一致する場合だけ読込み、dry-runを繰り返して `held=0` を確認する。parser errorやchecksum conflictは承認ファイルで迂回せずコード修正とテスト追加へ戻す。

- [ ] **Step 5: 法令単位の本更新を実行する**

Run:

```bash
cd web
npm run lawbook:current:refresh -- --review-dir config/law-refresh-mappings --json > ../../blra-backups/current-law-refresh-initial.json
```

Expected: `checked=120`、`held=0`、`failed=0`、check-onlyでchangedだった法令がupdated、残りがunchanged。途中失敗なら再実行前にrun reportを確認し、成功済み法令を巻き戻さない。

- [ ] **Step 6: DBとe-Govの版番号、範囲、URL、派生データを検証する**

Run:

```bash
cd web
npm run lawbook:current:verify -- --online
npm run lawbook:verify
npm run test:integration
npm run bench:article
npm run bench:search
```

Expected: 120法令すべてオンライン版番号一致、検証済み民法61範囲resolved、Article/Link公開境界違反0、article平均300ms未満、search平均200ms未満。

- [ ] **Step 7: 全自動テストとブラウザ導線をfreshに検証する**

Run:

```bash
cd web
npm test
npx tsc --noEmit
npm run build
npm run test:e2e
npx playwright test e2e/full-law-reader.spec.ts e2e/current-law-refresh.spec.ts
cd ..
npm test
npm run typecheck
```

Expected: Web Vitest、TypeScript、production build、HTTP E2E、Playwright、root tests/typecheckがすべてPASS。ブラウザで固定 `収録基準日: 2026-01-01` が0件。

- [ ] **Step 8: 初回runの監査可能な要約を文書化する**

`docs/operations/2026-08-current-law-initial-refresh.md` に実行日時、対象日、checked/unchanged/updated/held/failed、建築基準法の旧/new Revision ID、バックアップパス、run ID、package checksum、verifier/bench/test結果を書く。秘密鍵、DB URL、XML本文、内部error detailは書かない。

- [ ] **Step 9: review mappingと初回結果だけをコミットする**

```bash
git add docs/operations/2026-08-current-law-initial-refresh.md web/config/law-refresh-mappings
git commit -m "docs(refresh): record initial current-law rollout"
```

mappingファイルが0件なら存在しないdirectoryをstageせず、結果文書だけをコミットする。最後に `git status --short` で既存 `AGENTS.md` 以外がcleanであることを確認する。

- [ ] **Step 10: Task 9 backfill 完了後に legacy range fallback を除去する**

Task 9 の DB backfill（durableNodeKey/bodyChecksum/RangeResolution 生成）が完了し、
durable key ベースの RangeResolution が全ての検証済み抄録法令をカバーした時点で、
`web/src/lib/law-book/current-scope.ts` の legacy fallback ブロック
（`LawBookEntryRange` を使った `stableNodeKey` ベースの `OR EXISTS (...)` 節、
および上部の JSDoc にある legacy fallback 説明）を削除する。

手順:

1. `npm run lawbook:current:verify -- --online` を実行し、検証済み Range の
   resolution が全て `resolved` であることを確認する（legacy fallback に依存
   する法令が 0 件であることを保証）。
2. `web/src/lib/law-book/current-scope.ts` の legacy fallback ブロックと、
   該当箇所の `TODO(Task 9 backfill完了後)` コメントを削除する。
3. 既存テストが全件通過することを確認する:

```bash
cd web
npx vitest run src/__tests__/integration/current-law-read-scope.test.ts
npx tsc --noEmit
npm test
```

Expected: 全 PASS。legacy fallback 削除後も公開 Article の範囲は durable key
ベースの RangeResolution だけでカバーされるため、テスト結果が変わらないこと。

---

## Final Verification Matrix

| Requirement | Primary task | Final evidence |
|---|---:|---|
| 120法令だけを対象 | 8 | check report `checked=120` |
| 無変更法令はXML未取得 | 8 | service mock assertion |
| 現行施行版のみ | 3, 8 | asof test + online verifier |
| 条文挿入で数字ずれなし | 2, 4 | 第10条の2 fixture |
| 曖昧改番を自動公開しない | 4, 5 | held test/report |
| 法令単位の原子切替 | 7 | compare-and-swap integration test |
| 失敗法令だけ旧版維持 | 8 | two-law service test |
| 書籍版カタログを不変維持 | 10, 11 | entry旧版/current本文 fixture |
| 旧URL・削除条文 | 13 | successor + Playwright |
| 利用者根拠を不変維持 | 13 | highlight/annotation integration test |
| 抄録範囲の再解決 | 5, 9 | 民法61範囲 verifier |
| リンク・関係のRevision分離 | 12 | dependent scope test |
| 施行日・確認状態表示 | 14 | DTO + E2E |
| 廃止法令を保存して明示 | 8, 14 | service test + UI metadata |
| 毎日04:00 JST | 14 | operations cron contract |
| 初回最新化 | 15 | online verifier + rollout report |
