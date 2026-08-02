# Confirmed Reference Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 機械候補と人手確認済みの実務上の関連条文を物理的に分離し、Phase 1全文法令リーダーへ確認済み関係だけを本文外の開閉一覧として表示する。

**Architecture:** 既存の本文内引用 `Link` は変更せず、非公開候補 `RelatedArticleCandidate` と公開可能な `ConfirmedArticleRelation` を別テーブルにする。確認済み関係は全文JSONから独立した読取APIで版単位に一括取得し、本文取得とは独立して失敗・再試行できるクライアント状態として全文ビューアへ渡す。

**Tech Stack:** Next.js 14 App Router、React 18、TypeScript、Prisma 5、PostgreSQL、Vitest 4、Playwright

## Global Constraints

- 正本は `web/` → Prisma → `hourei_rag` とし、独立資産 `src/` / `blra` DBを統合・変更しない。
- `docs/design-spec.md` v1.3 §1.5 と `docs/superpowers/specs/2026-08-02-confirmed-reference-relations-design.md` に従う。
- 既存 `Link` は本文に明記された参照専用として維持し、取込時の再構築処理を変更しない。
- 未確認候補を全文JSON、公開API、Server Component、クライアント状態、HTMLへ含めない。
- 確認済み関係の参照元・参照先は初回実装では `Article.level = article` に限定する。
- 確認済み関係は版固有Article IDへ固定し、新版や近い条文へ自動移行しない。
- 読者画面は左ナビゲーションと本文の2列を維持し、右パネル、編集UI、AI推薦を戻さない。
- 関連情報の取得失敗で全文、目次、本文内リンクを隠さない。
- 確認済み関係の遷移先は新しいタブで開き、`rel="noopener noreferrer"` を付ける。
- 実在する関連条文を実装者判断でseedしない。実DBは空のまま、テストfixtureだけで検証する。
- `hourei_rag` へ `prisma migrate deploy` を実行しない。差分が追加操作だけであることを確認してから `prisma db push` を使う。
- 開始前から存在する `AGENTS.md` の利用者変更を編集・stage・commitしない。

---

## File Structure

### 新規作成

| ファイル | 責務 |
|---|---|
| `web/src/lib/relations/confirmed-relation.ts` | 公開型、関係種別ラベル、安定ソート、根拠文字列の検証 |
| `web/src/lib/relations/confirmed-relation-service.ts` | 候補保存、承認、棄却、手動確認、取消の唯一の書込境界 |
| `web/src/lib/relations/confirmed-relations-repository.ts` | 現行法令集範囲内の有効な確認済み関係だけを版単位で読む |
| `web/src/lib/relations/confirmed-relations-client.ts` | 確認済み関係APIのブラウザ取得とPromiseキャッシュ |
| `web/src/hooks/useConfirmedRelations.ts` | 関連情報だけのloading / ready / error / retry状態 |
| `web/src/app/api/law-revisions/[id]/confirmed-relations/route.ts` | 公開GET、ETag、短時間キャッシュ、404/500応答 |
| `web/src/components/article/ConfirmedRelationList.tsx` | 条ブロック直後の閉じた「確認済みの関連」一覧 |
| `web/src/__tests__/confirmed-relation-schema.test.ts` | Prismaモデル・enumの存在契約 |
| `web/src/__tests__/confirmed-relation.test.ts` | 公開型のソートと入力検証 |
| `web/src/__tests__/confirmed-relations-client.test.ts` | クライアントキャッシュと失敗後再試行 |
| `web/src/__tests__/integration/confirmed-relation-fixture.ts` | DB統合テスト専用のArticle・User fixtureと安全な後始末 |
| `web/src/__tests__/integration/confirmed-relation-service.test.ts` | 候補・確認・取消ライフサイクル |
| `web/src/__tests__/integration/confirmed-relations-api.test.ts` | 公開境界が候補・取消・範囲外を漏らさないこと |
| `web/e2e/confirmed-relations.spec.ts` | 開閉表示、新規タブ、候補非表示、部分失敗 |

### 変更

| ファイル | 変更内容 |
|---|---|
| `web/prisma/schema.prisma:68-113` | 関係用enum 4種を追加 |
| `web/prisma/schema.prisma:240-325` | Articleの候補・確認済み関係リレーションを追加 |
| `web/prisma/schema.prisma:348-359` | Userのレビュー・確認・取消リレーションを追加 |
| `web/prisma/schema.prisma:344` の直後 | 候補・確認済み関係モデルを追加 |
| `web/src/components/article/FullLawReader.tsx:32-123` | 関連情報を全文と並列取得し部分失敗を局所化 |
| `web/src/components/article/FullLawViewer.tsx:14-63` | source Article ID別の確認済み関係を条ブロックへ渡す |
| `web/src/components/article/ChapterArticleBlock.tsx:16-122` | 条ブロック末尾へ確認済み一覧を挿入 |
| `docs/HANDOFF.md:43-118` | 実装結果、検証件数、次タスクを更新 |

---

### Task 1: Prismaに非公開候補と確認済み関係の信頼境界を追加する

**Files:**
- Modify: `web/prisma/schema.prisma:68-113`
- Modify: `web/prisma/schema.prisma:240-359`
- Create: `web/src/__tests__/confirmed-relation-schema.test.ts`

**Interfaces:**
- Consumes: 既存 `Article`、`User`、`LawBookEntry`、`LawRevision`
- Produces: Prisma enum `RelationEdgeType`、`RelationCandidateMethod`、`RelationCandidateStatus`、`ConfirmedRelationOrigin`
- Produces: Prisma model `RelatedArticleCandidate`、`ConfirmedArticleRelation`

- [ ] **Step 1: 新モデルがまだ存在しないことを示す失敗テストを書く**

```typescript
// web/src/__tests__/confirmed-relation-schema.test.ts
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

function modelFields(modelName: string): string[] {
  const model = Prisma.dmmf.datamodel.models.find(
    (candidate) => candidate.name === modelName,
  );
  expect(model, `${modelName} must exist`).toBeDefined();
  return model?.fields.map((field) => field.name) ?? [];
}

describe("confirmed relation Prisma schema", () => {
  it("候補と確認済み関係を別モデルにする", () => {
    expect(modelFields("RelatedArticleCandidate")).toEqual(
      expect.arrayContaining([
        "sourceArticleId",
        "proposedTargetArticleId",
        "proposedTargetText",
        "relationType",
        "extractionMethod",
        "generatorVersion",
        "confidence",
        "candidateFingerprint",
        "status",
        "reviewedById",
        "reviewedAt",
        "reviewNote",
      ]),
    );
    expect(modelFields("ConfirmedArticleRelation")).toEqual(
      expect.arrayContaining([
        "sourceArticleId",
        "targetArticleId",
        "relationType",
        "rationale",
        "origin",
        "sourceCandidateId",
        "confirmedById",
        "confirmedAt",
        "revokedAt",
        "revokedById",
        "revocationReason",
      ]),
    );
  });

  it("設計書のenum値を固定する", () => {
    const enumValues = new Map(
      Prisma.dmmf.datamodel.enums.map((entry) => [
        entry.name,
        entry.values.map((value) => value.name),
      ]),
    );
    expect(enumValues.get("RelationEdgeType")).toEqual([
      "DELEGATES_TO",
      "APPLIES_MUTATIS_MUTANDIS",
      "DEFINES",
      "EXCEPTS",
      "CITES",
    ]);
    expect(enumValues.get("RelationCandidateStatus")).toEqual([
      "PENDING",
      "REJECTED",
      "PROMOTED",
    ]);
  });
});
```

- [ ] **Step 2: テストを実行してモデル未定義で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/confirmed-relation-schema.test.ts`

Expected: FAIL。`RelatedArticleCandidate must exist` またはenum未定義を報告する。

- [ ] **Step 3: Prisma enumとモデルを追加する**

`LinkType` の直後へ次を追加する。

```prisma
enum RelationEdgeType {
  DELEGATES_TO
  APPLIES_MUTATIS_MUTANDIS
  DEFINES
  EXCEPTS
  CITES
}

enum RelationCandidateMethod {
  RULE_BASED
  LLM_ASSISTED
}

enum RelationCandidateStatus {
  PENDING
  REJECTED
  PROMOTED
}

enum ConfirmedRelationOrigin {
  MANUAL
  CANDIDATE
}
```

`Article` へ名前付きリレーションを追加する。

```prisma
  relatedCandidatesFrom    RelatedArticleCandidate[]   @relation("RelatedCandidateSource")
  relatedCandidatesTo      RelatedArticleCandidate[]   @relation("RelatedCandidateTarget")
  confirmedRelationsFrom   ConfirmedArticleRelation[]  @relation("ConfirmedRelationSource")
  confirmedRelationsTo     ConfirmedArticleRelation[]  @relation("ConfirmedRelationTarget")
```

`User` へ名前付きリレーションを追加する。

```prisma
  relatedCandidatesReviewed RelatedArticleCandidate[]  @relation("RelatedCandidateReviewer")
  confirmedRelationsApproved ConfirmedArticleRelation[] @relation("ConfirmedRelationApprover")
  confirmedRelationsRevoked  ConfirmedArticleRelation[] @relation("ConfirmedRelationRevoker")
```

`Link` の後、`User` の前へ次の2モデルを追加する。

```prisma
model RelatedArticleCandidate {
  id                      String                    @id @default(cuid())
  sourceArticleId         String
  proposedTargetArticleId String?
  proposedTargetText      String?
  relationType            RelationEdgeType
  extractionMethod        RelationCandidateMethod
  generatorVersion        String
  confidence              Float
  rationale               String?
  candidateFingerprint    String                    @unique
  status                  RelationCandidateStatus   @default(PENDING)
  reviewedById            String?
  reviewedAt              DateTime?
  reviewNote              String?
  createdAt               DateTime                  @default(now())
  updatedAt               DateTime                  @updatedAt

  sourceArticle         Article                    @relation("RelatedCandidateSource", fields: [sourceArticleId], references: [id], onDelete: Restrict)
  proposedTargetArticle Article?                   @relation("RelatedCandidateTarget", fields: [proposedTargetArticleId], references: [id], onDelete: Restrict)
  reviewedBy            User?                      @relation("RelatedCandidateReviewer", fields: [reviewedById], references: [id], onDelete: Restrict)
  promotedRelation      ConfirmedArticleRelation?

  @@index([sourceArticleId, status])
  @@index([proposedTargetArticleId])
  @@index([status, createdAt])
}

model ConfirmedArticleRelation {
  id                String                    @id @default(cuid())
  sourceArticleId   String
  targetArticleId   String
  relationType      RelationEdgeType
  rationale         String
  origin            ConfirmedRelationOrigin
  sourceCandidateId String?                   @unique
  confirmedById     String
  confirmedAt       DateTime
  revokedAt         DateTime?
  revokedById       String?
  revocationReason  String?
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt

  sourceArticle  Article                  @relation("ConfirmedRelationSource", fields: [sourceArticleId], references: [id], onDelete: Restrict)
  targetArticle  Article                  @relation("ConfirmedRelationTarget", fields: [targetArticleId], references: [id], onDelete: Restrict)
  sourceCandidate RelatedArticleCandidate? @relation(fields: [sourceCandidateId], references: [id], onDelete: Restrict)
  confirmedBy    User                     @relation("ConfirmedRelationApprover", fields: [confirmedById], references: [id], onDelete: Restrict)
  revokedBy      User?                    @relation("ConfirmedRelationRevoker", fields: [revokedById], references: [id], onDelete: Restrict)

  @@index([sourceArticleId, revokedAt])
  @@index([targetArticleId, revokedAt])
  @@index([sourceArticleId, relationType, revokedAt])
}
```

- [ ] **Step 4: Prisma schemaを整形・生成し、契約テストを通す**

Run: `cd web && npx prisma format && npx prisma generate && npx vitest run src/__tests__/confirmed-relation-schema.test.ts`

Expected: PASS。Prisma validateエラーがない。

- [ ] **Step 5: 現行DBとの差分が追加操作だけであることを確認する**

Run:

```bash
cd web
set -a
source .env
set +a
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

Expected: 新enum、新テーブル、index、foreign keyの作成だけが出る。`DROP`、既存列の型変更、既存データ更新が1件でも出たら停止する。

- [ ] **Step 6: DBのschema-onlyバックアップを取り、非破壊のdb pushを適用する**

Run:

```bash
cd web
set -a
source .env
set +a
pg_dump "$DATABASE_URL" --schema-only --file /tmp/hourei-rag-before-confirmed-relations.sql
npx prisma db push
```

Expected: `The database is now in sync with the Prisma schema.`。データ削除警告が出ない。`prisma migrate deploy` は実行しない。

- [ ] **Step 7: Task 1の変更だけをコミットする**

```bash
git add web/prisma/schema.prisma web/src/__tests__/confirmed-relation-schema.test.ts
git commit -m "feat(relations): separate candidates from confirmed links"
```

---

### Task 2: 候補・承認・棄却・手動確認・取消を単一サービスへ閉じ込める

**Files:**
- Create: `web/src/lib/relations/confirmed-relation.ts`
- Create: `web/src/lib/relations/confirmed-relation-service.ts`
- Create: `web/src/__tests__/confirmed-relation.test.ts`
- Create: `web/src/__tests__/integration/confirmed-relation-fixture.ts`
- Create: `web/src/__tests__/integration/confirmed-relation-service.test.ts`

**Interfaces:**
- Consumes: Task 1のPrisma models / enums、`CURRENT_LAW_BOOK_EDITION_KEY`、`lawBookArticleScopeSql()`
- Produces: `ConfirmedRelation`、`ConfirmedRelationsDocument`、`RELATION_TYPE_LABELS`、`sortConfirmedRelationRows()`
- Produces: `saveRelatedArticleCandidate()`、`approveRelatedArticleCandidate()`、`rejectRelatedArticleCandidate()`、`createManualConfirmedRelation()`、`revokeConfirmedRelation()`

- [ ] **Step 1: 公開型・根拠検証・並び順の失敗テストを書く**

```typescript
// web/src/__tests__/confirmed-relation.test.ts
import { describe, expect, it } from "vitest";
import {
  normalizeRelationRationale,
  sortConfirmedRelationRows,
  type ConfirmedRelationSortRow,
} from "@/lib/relations/confirmed-relation";

const base: ConfirmedRelationSortRow = {
  id: "relation-1",
  relationType: "CITES",
  confirmedAt: "2026-08-02T00:00:00.000Z",
  targetLawDisplayOrder: 1,
  targetArticleSortOrder: 2,
};

describe("confirmed relation domain", () => {
  it("委任、準用、定義、例外、参照の順で安定ソートする", () => {
    const rows: ConfirmedRelationSortRow[] = [
      base,
      { ...base, id: "relation-2", relationType: "DEFINES" },
      { ...base, id: "relation-3", relationType: "DELEGATES_TO" },
      { ...base, id: "relation-4", relationType: "EXCEPTS" },
      { ...base, id: "relation-5", relationType: "APPLIES_MUTATIS_MUTANDIS" },
    ];
    expect(sortConfirmedRelationRows(rows).map((row) => row.id)).toEqual([
      "relation-3",
      "relation-5",
      "relation-2",
      "relation-4",
      "relation-1",
    ]);
  });

  it("根拠をtrimし、空文字と501文字を拒否する", () => {
    expect(normalizeRelationRationale("  確認済み  ")).toBe("確認済み");
    expect(() => normalizeRelationRationale("   ")).toThrow("1〜500文字");
    expect(() => normalizeRelationRationale("あ".repeat(501))).toThrow("1〜500文字");
  });
});
```

- [ ] **Step 2: 単体テストを実行してモジュール未定義で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/confirmed-relation.test.ts`

Expected: FAIL。`@/lib/relations/confirmed-relation` を解決できない。

- [ ] **Step 3: 公開型、ラベル、検証、安定ソートを実装する**

```typescript
// web/src/lib/relations/confirmed-relation.ts
export const RELATION_TYPE_ORDER = [
  "DELEGATES_TO",
  "APPLIES_MUTATIS_MUTANDIS",
  "DEFINES",
  "EXCEPTS",
  "CITES",
] as const;

export type RelationEdgeTypeValue = (typeof RELATION_TYPE_ORDER)[number];

export const RELATION_TYPE_LABELS: Record<RelationEdgeTypeValue, string> = {
  DELEGATES_TO: "委任先",
  APPLIES_MUTATIS_MUTANDIS: "準用",
  DEFINES: "定義",
  EXCEPTS: "例外",
  CITES: "参照",
};

export interface ConfirmedRelation {
  id: string;
  relationType: RelationEdgeTypeValue;
  rationale: string;
  confirmedAt: string;
  target: {
    articleId: string;
    lawName: string;
    lawShortName: string | null;
    articleNumber: string | null;
    caption: string | null;
  };
}

export interface ConfirmedRelationsDocument {
  revisionId: string;
  relationsBySource: Record<string, ConfirmedRelation[]>;
}

export interface ConfirmedRelationSortRow {
  id: string;
  relationType: RelationEdgeTypeValue;
  confirmedAt: string;
  targetLawDisplayOrder: number;
  targetArticleSortOrder: number;
}

export function normalizeRelationRationale(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new Error("確認根拠は1〜500文字で入力してください");
  }
  return normalized;
}

export function sortConfirmedRelationRows<T extends ConfirmedRelationSortRow>(
  relations: T[],
): T[] {
  const typeOrder = new Map(
    RELATION_TYPE_ORDER.map((value, index) => [value, index]),
  );
  return [...relations].sort((left, right) =>
    (typeOrder.get(left.relationType) ?? 99) -
      (typeOrder.get(right.relationType) ?? 99) ||
    left.targetLawDisplayOrder - right.targetLawDisplayOrder ||
    left.targetArticleSortOrder - right.targetArticleSortOrder ||
    left.confirmedAt.localeCompare(right.confirmedAt) ||
    left.id.localeCompare(right.id),
  );
}
```

- [ ] **Step 4: DB fixtureとライフサイクル統合テストを書く**

`confirmed-relation-fixture.ts` は現在の法令集から建築基準法の先頭2条とその `lawRevisionId` を読み、テスト専用Userを作る。見つからない環境では `null` を返す。後始末は、確認済み関係 → `generatorVersion = test:{reviewerId}` の候補 → Userの順で物理削除する。

```typescript
// web/src/__tests__/integration/confirmed-relation-fixture.ts
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

export interface RelationFixture {
  reviewerId: string;
  revisionId: string;
  sourceArticleId: string;
  targetArticleId: string;
  generatorVersion: string;
}

export async function createRelationFixture(
  prisma: PrismaClient,
): Promise<RelationFixture | null> {
  const entry = await prisma.lawBookEntry.findFirst({
    where: {
      edition: { editionKey: CURRENT_LAW_BOOK_EDITION_KEY },
      law: { egovLawId: "325AC0000000201" },
      lawRevisionId: { not: null },
    },
    select: { lawRevisionId: true },
  });
  if (!entry?.lawRevisionId) return null;
  const articles = await prisma.article.findMany({
    where: {
      lawRevisionId: entry.lawRevisionId,
      level: "article",
      deletedAt: null,
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
    take: 2,
  });
  if (articles.length < 2) return null;
  const reviewerId = `relation-test-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id: reviewerId,
      name: "確認済み関連テスト",
      email: `${reviewerId}@example.invalid`,
    },
  });
  return {
    reviewerId,
    revisionId: entry.lawRevisionId,
    sourceArticleId: articles[0].id,
    targetArticleId: articles[1].id,
    generatorVersion: `test:${reviewerId}`,
  };
}

export async function cleanupRelationFixture(
  prisma: PrismaClient,
  fixture: RelationFixture,
): Promise<void> {
  await prisma.confirmedArticleRelation.deleteMany({
    where: {
      OR: [
        { confirmedById: fixture.reviewerId },
        { revokedById: fixture.reviewerId },
      ],
    },
  });
  await prisma.relatedArticleCandidate.deleteMany({
    where: { generatorVersion: fixture.generatorVersion },
  });
  await prisma.user.deleteMany({ where: { id: fixture.reviewerId } });
}
```

```typescript
// web/src/__tests__/integration/confirmed-relation-service.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approveRelatedArticleCandidate,
  createManualConfirmedRelation,
  rejectRelatedArticleCandidate,
  revokeConfirmedRelation,
  saveRelatedArticleCandidate,
} from "@/lib/relations/confirmed-relation-service";
import {
  cleanupRelationFixture,
  createRelationFixture,
  type RelationFixture,
} from "@/__tests__/integration/confirmed-relation-fixture";

const prisma = new PrismaClient();
const fixtures: RelationFixture[] = [];

beforeAll(async () => prisma.$connect());
afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupRelationFixture(prisma, fixtures.pop()!);
  }
});
afterAll(async () => prisma.$disconnect());

describe("confirmed relation service (integration)", () => {
  it("候補を修正承認して元候補と確定内容を分離保存する", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);

    const candidateInput = {
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: `test:${fixture.reviewerId}`,
      confidence: 0.72,
      rationale: "機械候補",
    } as const;
    const candidate = await saveRelatedArticleCandidate(candidateInput);
    expect((await saveRelatedArticleCandidate(candidateInput)).id).toBe(
      candidate.id,
    );
    const confirmed = await approveRelatedArticleCandidate({
      candidateId: candidate.id,
      targetArticleId: fixture.targetArticleId,
      relationType: "DEFINES",
      rationale: "両条の用語定義をあわせて確認するため",
      reviewerId: fixture.reviewerId,
      reviewNote: "参照から定義へ修正",
    });

    expect(confirmed.origin).toBe("CANDIDATE");
    expect(confirmed.relationType).toBe("DEFINES");
    expect(confirmed.sourceCandidateId).toBe(candidate.id);
    const savedCandidate = await prisma.relatedArticleCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    expect(savedCandidate.status).toBe("PROMOTED");
    expect(savedCandidate.relationType).toBe("CITES");
  });

  it("棄却候補から確認済み関係を作れない", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const candidate = await saveRelatedArticleCandidate({
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: `test:${fixture.reviewerId}`,
      confidence: 0.4,
      rationale: null,
    });
    await rejectRelatedArticleCandidate({
      candidateId: candidate.id,
      reviewerId: fixture.reviewerId,
      reason: "実務上の関連を確認できない",
    });
    await expect(
      approveRelatedArticleCandidate({
        candidateId: candidate.id,
        targetArticleId: fixture.targetArticleId,
        relationType: "CITES",
        rationale: "承認してはならない",
        reviewerId: fixture.reviewerId,
        reviewNote: null,
      }),
    ).rejects.toThrow("PENDING");
  });

  it("手動確認、重複拒否、取消を同じサービスで行う", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    const relation = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "例外規定として人が確認したため",
      reviewerId: fixture.reviewerId,
    });
    await expect(
      createManualConfirmedRelation({
        sourceArticleId: fixture.sourceArticleId,
        targetArticleId: fixture.targetArticleId,
        relationType: "EXCEPTS",
        rationale: "重複",
        reviewerId: fixture.reviewerId,
      }),
    ).rejects.toThrow("同じ有効関係");
    await revokeConfirmedRelation({
      relationId: relation.id,
      reviewerId: fixture.reviewerId,
      reason: "確認内容を見直すため",
    });
    expect(
      await prisma.confirmedArticleRelation.findUniqueOrThrow({
        where: { id: relation.id },
      }),
    ).toMatchObject({ revokedById: fixture.reviewerId });
    const reconfirmed = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "EXCEPTS",
      rationale: "取消後に改めて確認したため",
      reviewerId: fixture.reviewerId,
    });
    expect(reconfirmed.id).not.toBe(relation.id);
  });
});
```

- [ ] **Step 5: 統合テストを実行してサービス未定義で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/confirmed-relation-service.test.ts`

Expected: FAIL。`confirmed-relation-service` またはfixture moduleが未定義。

- [ ] **Step 6: 書込サービスを実装する**

公開する入力型と関数シグネチャを次で固定する。

```typescript
export interface SaveCandidateInput {
  sourceArticleId: string;
  proposedTargetArticleId: string | null;
  proposedTargetText: string | null;
  relationType: RelationEdgeType;
  extractionMethod: RelationCandidateMethod;
  generatorVersion: string;
  confidence: number;
  rationale: string | null;
}

export interface ApproveCandidateInput {
  candidateId: string;
  targetArticleId: string;
  relationType: RelationEdgeType;
  rationale: string;
  reviewerId: string;
  reviewNote: string | null;
}

export interface RejectCandidateInput {
  candidateId: string;
  reviewerId: string;
  reason: string;
}

export interface ManualConfirmedRelationInput {
  sourceArticleId: string;
  targetArticleId: string;
  relationType: RelationEdgeType;
  rationale: string;
  reviewerId: string;
}

export interface RevokeConfirmedRelationInput {
  relationId: string;
  reviewerId: string;
  reason: string;
}
```

`confirmed-relation-service.ts` は次の規則を実装する。

```typescript
const relationScopeSql = lawBookArticleScopeSql("article", "entry");

async function assertCurrentArticle(
  tx: Prisma.TransactionClient,
  articleId: string,
): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT article.id
       FROM "Article" article
       JOIN "LawBookEntry" entry
         ON entry."lawId" = article."lawId"
        AND entry."lawRevisionId" = article."lawRevisionId"
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
      WHERE article.id = $1
        AND article.level = 'article'
        AND article."deletedAt" IS NULL
        AND edition."editionKey" = $2
        AND ${relationScopeSql}
      LIMIT 1`,
    articleId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  if (rows.length === 0) {
    throw new Error("確認済み関係には現行法令集内の条ノードが必要です");
  }
}

function candidateFingerprint(input: SaveCandidateInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      sourceArticleId: input.sourceArticleId,
      proposedTargetArticleId: input.proposedTargetArticleId,
      proposedTargetText: input.proposedTargetText?.trim() || null,
      relationType: input.relationType,
      extractionMethod: input.extractionMethod,
      generatorVersion: input.generatorVersion.trim(),
    }))
    .digest("hex");
}
```

残りのサービス本体は次の形にする。すべての書込で同じ検証関数を使い、管理用routeからPrismaを直接更新できる余地を作らない。

```typescript
const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 500) throw new Error("入力は500文字以内です");
  return normalized;
}

async function assertReviewer(
  tx: Prisma.TransactionClient,
  reviewerId: string,
): Promise<void> {
  const reviewer = await tx.user.findUnique({
    where: { id: reviewerId },
    select: { id: true },
  });
  if (!reviewer) throw new Error("確認者が存在しません");
}

async function assertNoActiveDuplicate(
  tx: Prisma.TransactionClient,
  sourceArticleId: string,
  targetArticleId: string,
  relationType: RelationEdgeType,
): Promise<void> {
  const duplicate = await tx.confirmedArticleRelation.findFirst({
    where: {
      sourceArticleId,
      targetArticleId,
      relationType,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("同じ有効関係が既に存在します");
}

function assertDistinctArticles(sourceArticleId: string, targetArticleId: string) {
  if (sourceArticleId === targetArticleId) {
    throw new Error("参照元と参照先には別の条文を指定してください");
  }
}

export async function saveRelatedArticleCandidate(input: SaveCandidateInput) {
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error("confidenceは0以上1以下で指定してください");
  }
  const generatorVersion = input.generatorVersion.trim();
  if (!generatorVersion) throw new Error("generatorVersionは必須です");
  const proposedTargetText = normalizeOptionalText(input.proposedTargetText);
  if (!input.proposedTargetArticleId && !proposedTargetText) {
    throw new Error("候補の参照先IDまたは参照先文字列が必要です");
  }
  if (input.proposedTargetArticleId) {
    assertDistinctArticles(input.sourceArticleId, input.proposedTargetArticleId);
  }
  const fingerprint = candidateFingerprint(input);
  return prisma.$transaction(async (tx) => {
    await assertCurrentArticle(tx, input.sourceArticleId);
    const existing = await tx.relatedArticleCandidate.findUnique({
      where: { candidateFingerprint: fingerprint },
    });
    if (existing) return existing;
    return tx.relatedArticleCandidate.create({
      data: {
        sourceArticleId: input.sourceArticleId,
        proposedTargetArticleId: input.proposedTargetArticleId,
        proposedTargetText,
        relationType: input.relationType,
        extractionMethod: input.extractionMethod,
        generatorVersion,
        confidence: input.confidence,
        rationale: normalizeOptionalText(input.rationale),
        candidateFingerprint: fingerprint,
      },
    });
  }, SERIALIZABLE);
}

export async function approveRelatedArticleCandidate(
  input: ApproveCandidateInput,
) {
  const rationale = normalizeRelationRationale(input.rationale);
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.relatedArticleCandidate.findUnique({
      where: { id: input.candidateId },
    });
    if (!candidate || candidate.status !== "PENDING") {
      throw new Error("PENDINGの候補だけを承認できます");
    }
    assertDistinctArticles(candidate.sourceArticleId, input.targetArticleId);
    await Promise.all([
      assertReviewer(tx, input.reviewerId),
      assertCurrentArticle(tx, candidate.sourceArticleId),
      assertCurrentArticle(tx, input.targetArticleId),
    ]);
    await assertNoActiveDuplicate(
      tx,
      candidate.sourceArticleId,
      input.targetArticleId,
      input.relationType,
    );
    const reviewedAt = new Date();
    const claimed = await tx.relatedArticleCandidate.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: {
        status: "PROMOTED",
        reviewedById: input.reviewerId,
        reviewedAt,
        reviewNote: normalizeOptionalText(input.reviewNote),
      },
    });
    if (claimed.count !== 1) throw new Error("PENDINGの候補だけを承認できます");
    return tx.confirmedArticleRelation.create({
      data: {
        sourceArticleId: candidate.sourceArticleId,
        targetArticleId: input.targetArticleId,
        relationType: input.relationType,
        rationale,
        origin: "CANDIDATE",
        sourceCandidateId: candidate.id,
        confirmedById: input.reviewerId,
        confirmedAt: reviewedAt,
      },
    });
  }, SERIALIZABLE);
}

export async function rejectRelatedArticleCandidate(
  input: RejectCandidateInput,
) {
  const reason = normalizeRelationRationale(input.reason);
  return prisma.$transaction(async (tx) => {
    await assertReviewer(tx, input.reviewerId);
    const result = await tx.relatedArticleCandidate.updateMany({
      where: { id: input.candidateId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (result.count !== 1) throw new Error("PENDINGの候補だけを棄却できます");
    return tx.relatedArticleCandidate.findUniqueOrThrow({
      where: { id: input.candidateId },
    });
  }, SERIALIZABLE);
}

export async function createManualConfirmedRelation(
  input: ManualConfirmedRelationInput,
) {
  const rationale = normalizeRelationRationale(input.rationale);
  assertDistinctArticles(input.sourceArticleId, input.targetArticleId);
  return prisma.$transaction(async (tx) => {
    await Promise.all([
      assertReviewer(tx, input.reviewerId),
      assertCurrentArticle(tx, input.sourceArticleId),
      assertCurrentArticle(tx, input.targetArticleId),
    ]);
    await assertNoActiveDuplicate(
      tx,
      input.sourceArticleId,
      input.targetArticleId,
      input.relationType,
    );
    return tx.confirmedArticleRelation.create({
      data: {
        sourceArticleId: input.sourceArticleId,
        targetArticleId: input.targetArticleId,
        relationType: input.relationType,
        rationale,
        origin: "MANUAL",
        confirmedById: input.reviewerId,
        confirmedAt: new Date(),
      },
    });
  }, SERIALIZABLE);
}

export async function revokeConfirmedRelation(
  input: RevokeConfirmedRelationInput,
) {
  const reason = normalizeRelationRationale(input.reason);
  return prisma.$transaction(async (tx) => {
    await assertReviewer(tx, input.reviewerId);
    const result = await tx.confirmedArticleRelation.updateMany({
      where: { id: input.relationId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedById: input.reviewerId,
        revocationReason: reason,
      },
    });
    if (result.count !== 1) throw new Error("有効な確認済み関係がありません");
    return tx.confirmedArticleRelation.findUniqueOrThrow({
      where: { id: input.relationId },
    });
  }, SERIALIZABLE);
}
```

`confirmed-relation-service.ts` の先頭で `createHash`、Prisma enum/namespace、`prisma`、`CURRENT_LAW_BOOK_EDITION_KEY`、`lawBookArticleScopeSql`、`normalizeRelationRationale` をimportする。

- [ ] **Step 7: 単体・統合テストを通す**

Run: `cd web && npx vitest run src/__tests__/confirmed-relation.test.ts src/__tests__/integration/confirmed-relation-service.test.ts`

Expected: PASS。テスト後に `RelatedArticleCandidate`、`ConfirmedArticleRelation`、テストUserが残らない。

- [ ] **Step 8: Task 2をコミットする**

```bash
git add web/src/lib/relations/confirmed-relation.ts web/src/lib/relations/confirmed-relation-service.ts web/src/__tests__/confirmed-relation.test.ts web/src/__tests__/integration/confirmed-relation-fixture.ts web/src/__tests__/integration/confirmed-relation-service.test.ts
git commit -m "feat(relations): add reviewed relation lifecycle"
```

---

### Task 3: 確認済み関係だけを返す版単位の公開APIを追加する

**Files:**
- Create: `web/src/lib/relations/confirmed-relations-repository.ts`
- Create: `web/src/app/api/law-revisions/[id]/confirmed-relations/route.ts`
- Create: `web/src/__tests__/integration/confirmed-relations-api.test.ts`

**Interfaces:**
- Consumes: Task 2の `ConfirmedRelationsDocument`、`sortConfirmedRelationRows()`、fixture、書込サービス
- Produces: `getConfirmedRelationsDocument(lawRevisionId: string): Promise<ConfirmedRelationsDocument | null>`
- Produces: `GET /api/law-revisions/{lawRevisionId}/confirmed-relations`

- [ ] **Step 1: 候補と取消済み関係が公開されない失敗テストを書く**

```typescript
// web/src/__tests__/integration/confirmed-relations-api.test.ts
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET as getConfirmedRelations } from "@/app/api/law-revisions/[id]/confirmed-relations/route";
import { getConfirmedRelationsDocument } from "@/lib/relations/confirmed-relations-repository";
import {
  createManualConfirmedRelation,
  revokeConfirmedRelation,
  saveRelatedArticleCandidate,
} from "@/lib/relations/confirmed-relation-service";
import {
  cleanupRelationFixture,
  createRelationFixture,
  type RelationFixture,
} from "@/__tests__/integration/confirmed-relation-fixture";

const prisma = new PrismaClient();
const fixtures: RelationFixture[] = [];

beforeAll(async () => prisma.$connect());
afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupRelationFixture(prisma, fixtures.pop()!);
  }
});
afterAll(async () => prisma.$disconnect());

describe("confirmed relations API (integration)", () => {
  it("有効な確認済み関係だけを公開する", async () => {
    const fixture = await createRelationFixture(prisma);
    if (!fixture) return;
    fixtures.push(fixture);
    await saveRelatedArticleCandidate({
      sourceArticleId: fixture.sourceArticleId,
      proposedTargetArticleId: fixture.targetArticleId,
      proposedTargetText: null,
      relationType: "CITES",
      extractionMethod: "RULE_BASED",
      generatorVersion: fixture.generatorVersion,
      confidence: 0.63,
      rationale: "公開してはならない候補",
    });
    const active = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "DEFINES",
      rationale: "用語定義をあわせて確認するため",
      reviewerId: fixture.reviewerId,
    });
    const revoked = await createManualConfirmedRelation({
      sourceArticleId: fixture.sourceArticleId,
      targetArticleId: fixture.targetArticleId,
      relationType: "CITES",
      rationale: "取消対象",
      reviewerId: fixture.reviewerId,
    });
    await revokeConfirmedRelation({
      relationId: revoked.id,
      reviewerId: fixture.reviewerId,
      reason: "公開対象から除外するテスト",
    });
    const excludedTargets = await prisma.article.findMany({
      where: {
        level: "article",
        OR: [
          { deletedAt: { not: null } },
          {
            law: { egovLawId: "129AC0000000089" },
            articleNumberNormalized: "208",
          },
        ],
      },
      select: { id: true },
      take: 2,
    });
    const excludedRelations = await Promise.all(
      excludedTargets.map((target) =>
        prisma.confirmedArticleRelation.create({
          data: {
            sourceArticleId: fixture.sourceArticleId,
            targetArticleId: target.id,
            relationType: "EXCEPTS",
            rationale: "公開範囲外を除外するテスト",
            origin: "MANUAL",
            confirmedById: fixture.reviewerId,
            confirmedAt: new Date(),
          },
        }),
      ),
    );

    const document = await getConfirmedRelationsDocument(fixture.revisionId);
    const rows = document?.relationsBySource[fixture.sourceArticleId] ?? [];
    expect(rows.some((row) => row.id === active.id)).toBe(true);
    expect(rows.some((row) => row.id === revoked.id)).toBe(false);
    for (const excluded of excludedRelations) {
      expect(rows.some((row) => row.id === excluded.id)).toBe(false);
    }
    expect(JSON.stringify(document)).not.toContain("confidence");
    expect(JSON.stringify(document)).not.toContain("generatorVersion");
    expect(JSON.stringify(document)).not.toContain(fixture.reviewerId);

    const url = `http://localhost/api/law-revisions/${fixture.revisionId}/confirmed-relations`;
    const response = await getConfirmedRelations(new NextRequest(url), {
      params: { id: fixture.revisionId },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    const notModified = await getConfirmedRelations(
      new NextRequest(url, { headers: { "If-None-Match": etag! } }),
      { params: { id: fixture.revisionId } },
    );
    expect(notModified.status).toBe(304);
  });

  it("現在の法令集にないrevisionは404にする", async () => {
    const response = await getConfirmedRelations(
      new NextRequest(
        "http://localhost/api/law-revisions/missing/confirmed-relations",
      ),
      { params: { id: "missing" } },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
```

- [ ] **Step 2: API統合テストを実行してrepository/route未定義で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/integration/confirmed-relations-api.test.ts`

Expected: FAIL。repositoryまたはroute moduleが未定義。

- [ ] **Step 3: 公開Repositoryを実装する**

SQLは `ConfirmedArticleRelation` から始め、候補テーブルをJOINしない。参照元・参照先の両方へ `lawBookArticleScopeSql()` を適用する。

```typescript
// web/src/lib/relations/confirmed-relations-repository.ts
import { prisma } from "@/lib/db";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { lawBookArticleScopeSql } from "@/lib/law-book/sql-scope";
import {
  sortConfirmedRelationRows,
  type ConfirmedRelation,
  type ConfirmedRelationsDocument,
  type RelationEdgeTypeValue,
} from "@/lib/relations/confirmed-relation";

interface ConfirmedRelationRow {
  id: string;
  sourceArticleId: string;
  relationType: RelationEdgeTypeValue;
  rationale: string;
  confirmedAt: Date;
  targetArticleId: string;
  targetLawName: string;
  targetLawShortName: string | null;
  targetArticleNumber: string | null;
  targetCaption: string | null;
  targetLawDisplayOrder: number;
  targetArticleSortOrder: number;
}

async function getCurrentEditionRevision(
  lawRevisionId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT revision.id
       FROM "LawRevision" revision
       JOIN "LawBookEntry" entry
         ON entry."lawId" = revision."lawId"
        AND entry."lawRevisionId" = revision.id
       JOIN "LawBookEdition" edition ON edition.id = entry."editionId"
      WHERE revision.id = $1
        AND edition."editionKey" = $2
      LIMIT 1`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
  return rows.length === 1;
}

async function getActiveConfirmedRelationRows(
  lawRevisionId: string,
): Promise<ConfirmedRelationRow[]> {
  const sourceScope = lawBookArticleScopeSql("source", "source_entry");
  const targetScope = lawBookArticleScopeSql("target", "target_entry");
  return prisma.$queryRawUnsafe<ConfirmedRelationRow[]>(
    `SELECT
       relation.id,
       relation."sourceArticleId",
       relation."relationType",
       relation.rationale,
       relation."confirmedAt",
       target.id AS "targetArticleId",
       target_law.name AS "targetLawName",
       target_law."shortName" AS "targetLawShortName",
       target."articleNumber" AS "targetArticleNumber",
       target.caption AS "targetCaption",
       target_entry."displayOrder" AS "targetLawDisplayOrder",
       target."sortOrder" AS "targetArticleSortOrder"
     FROM "ConfirmedArticleRelation" relation
     JOIN "Article" source ON source.id = relation."sourceArticleId"
     JOIN "Article" target ON target.id = relation."targetArticleId"
     JOIN "Law" target_law ON target_law.id = target."lawId"
     JOIN "LawBookEntry" source_entry
       ON source_entry."lawId" = source."lawId"
      AND source_entry."lawRevisionId" = source."lawRevisionId"
     JOIN "LawBookEdition" source_edition
       ON source_edition.id = source_entry."editionId"
     JOIN "LawBookEntry" target_entry
       ON target_entry."lawId" = target."lawId"
      AND target_entry."lawRevisionId" = target."lawRevisionId"
     JOIN "LawBookEdition" target_edition
       ON target_edition.id = target_entry."editionId"
     WHERE source."lawRevisionId" = $1
       AND relation."revokedAt" IS NULL
       AND source.level = 'article'
       AND target.level = 'article'
       AND source."deletedAt" IS NULL
       AND target."deletedAt" IS NULL
       AND source_edition."editionKey" = $2
       AND target_edition."editionKey" = $2
       AND ${sourceScope}
       AND ${targetScope}`,
    lawRevisionId,
    CURRENT_LAW_BOOK_EDITION_KEY,
  );
}

export async function getConfirmedRelationsDocument(
  lawRevisionId: string,
): Promise<ConfirmedRelationsDocument | null> {
  const revision = await getCurrentEditionRevision(lawRevisionId);
  if (!revision) return null;
  const rows = await getActiveConfirmedRelationRows(lawRevisionId);
  const relationsBySource: Record<string, ConfirmedRelation[]> = {};
  const sortedRows = sortConfirmedRelationRows(
    rows.map((row) => ({
      ...row,
      confirmedAt: row.confirmedAt.toISOString(),
    })),
  );
  for (const row of sortedRows) {
    (relationsBySource[row.sourceArticleId] ??= []).push({
      id: row.id,
      relationType: row.relationType,
      rationale: row.rationale,
      confirmedAt: row.confirmedAt,
      target: {
        articleId: row.targetArticleId,
        lawName: row.targetLawName,
        lawShortName: row.targetLawShortName,
        articleNumber: row.targetArticleNumber,
        caption: row.targetCaption,
      },
    });
  }
  return { revisionId: lawRevisionId, relationsBySource };
}
```

SQLの必須WHERE句は次とする。

```sql
source."lawRevisionId" = $1
AND relation."revokedAt" IS NULL
AND source.level = 'article'
AND target.level = 'article'
AND source."deletedAt" IS NULL
AND target."deletedAt" IS NULL
AND source_edition."editionKey" = $2
AND target_edition."editionKey" = $2
AND ${sourceScope}
AND ${targetScope}
```

- [ ] **Step 4: ETag付き読取専用routeを実装する**

```typescript
// web/src/app/api/law-revisions/[id]/confirmed-relations/route.ts
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getConfirmedRelationsDocument } from "@/lib/relations/confirmed-relations-repository";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
type RouteContext = { params: { id: string } | Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const document = await getConfirmedRelationsDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: "law revision not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = JSON.stringify(document);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
      });
    }
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Failed to load confirmed relations", error);
    return NextResponse.json(
      { error: "failed to load confirmed relations" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

- [ ] **Step 5: API統合テストを通す**

Run: `cd web && npx vitest run src/__tests__/integration/confirmed-relations-api.test.ts`

Expected: PASS。JSON文字列に候補固有フィールドと確認者IDが含まれない。

- [ ] **Step 6: Task 3をコミットする**

```bash
git add web/src/lib/relations/confirmed-relations-repository.ts 'web/src/app/api/law-revisions/[id]/confirmed-relations/route.ts' web/src/__tests__/integration/confirmed-relations-api.test.ts
git commit -m "feat(relations): expose confirmed relations only"
```

---

### Task 4: 関連情報を全文から独立して取得し、部分失敗を局所化する

**Files:**
- Create: `web/src/lib/relations/confirmed-relations-client.ts`
- Create: `web/src/hooks/useConfirmedRelations.ts`
- Create: `web/src/__tests__/confirmed-relations-client.test.ts`
- Modify: `web/src/components/article/FullLawReader.tsx:32-123`

**Interfaces:**
- Consumes: Task 3のGET APIと `ConfirmedRelationsDocument`
- Produces: `fetchConfirmedRelations()`、`clearConfirmedRelationsCache()`
- Produces: `useConfirmedRelations(revisionId)` → `{ status, document, retry }`
- Produces: 全文表示をブロックしない `ConfirmedRelationsPartialError`

- [ ] **Step 1: クライアントキャッシュと失敗後再試行の失敗テストを書く**

```typescript
// web/src/__tests__/confirmed-relations-client.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearConfirmedRelationsCache,
  fetchConfirmedRelations,
} from "@/lib/relations/confirmed-relations-client";
import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";

const fixture: ConfirmedRelationsDocument = {
  revisionId: "rev-1",
  relationsBySource: {},
};

beforeEach(() => clearConfirmedRelationsCache());

describe("confirmed relations client", () => {
  it("同じrevisionを1回だけ取得する", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture)),
    );
    await fetchConfirmedRelations("rev-1", fetcher);
    await fetchConfirmedRelations("rev-1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/law-revisions/rev-1/confirmed-relations",
    );
  });

  it("失敗をキャッシュせず次の取得で再試行する", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
    await expect(fetchConfirmedRelations("rev-1", fetcher)).rejects.toThrow();
    await expect(fetchConfirmedRelations("rev-1", fetcher)).resolves.toEqual(
      fixture,
    );
  });
});
```

- [ ] **Step 2: テストを実行してclient module未定義で失敗することを確認する**

Run: `cd web && npx vitest run src/__tests__/confirmed-relations-client.test.ts`

Expected: FAIL。`confirmed-relations-client` が未定義。

- [ ] **Step 3: 全文clientと同じ失敗排除型Promiseキャッシュを実装する**

```typescript
// web/src/lib/relations/confirmed-relations-client.ts
import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";

const cache = new Map<string, Promise<ConfirmedRelationsDocument>>();

export async function fetchConfirmedRelations(
  revisionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ConfirmedRelationsDocument> {
  const cached = cache.get(revisionId);
  if (cached) return cached;
  const request = fetcher(
    `/api/law-revisions/${encodeURIComponent(revisionId)}/confirmed-relations`,
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(`確認済みの関連を取得できません (${response.status})`);
    }
    return (await response.json()) as ConfirmedRelationsDocument;
  });
  cache.set(revisionId, request);
  request.catch(() => {
    if (cache.get(revisionId) === request) cache.delete(revisionId);
  });
  return request;
}

export function clearConfirmedRelationsCache(revisionId?: string): void {
  if (revisionId) cache.delete(revisionId);
  else cache.clear();
}
```

- [ ] **Step 4: 関連情報専用hookを実装する**

```typescript
// web/src/hooks/useConfirmedRelations.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";
import {
  clearConfirmedRelationsCache,
  fetchConfirmedRelations,
} from "@/lib/relations/confirmed-relations-client";

export type ConfirmedRelationsState = {
  status: "loading" | "ready" | "error";
  document: ConfirmedRelationsDocument | null;
  retry: () => void;
};

export function useConfirmedRelations(
  revisionId: string,
): ConfirmedRelationsState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<ConfirmedRelationsState, "retry">>({
    status: "loading",
    document: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", document: null });
    fetchConfirmedRelations(revisionId)
      .then((document) => {
        if (active) setState({ status: "ready", document });
      })
      .catch(() => {
        if (active) setState({ status: "error", document: null });
      });
    return () => {
      active = false;
    };
  }, [attempt, revisionId]);

  const retry = useCallback(() => {
    clearConfirmedRelationsCache(revisionId);
    setAttempt((current) => current + 1);
  }, [revisionId]);

  return { ...state, retry };
}
```

- [ ] **Step 5: FullLawReaderで全文と関連を独立取得する**

`FullLawReaderContent` の先頭で両hookを呼ぶ。

```typescript
const state = useFullLawDocument(props.lawRevisionId);
const relationsState = useConfirmedRelations(props.lawRevisionId);
```

全文がloading/errorなら現行表示を維持する。全文ready後は `FullLawReadyLayout` へ `relationsState` を渡す。Task 4では関連だけerrorの場合の通知までを接続し、readyデータの条ブロック表示はTask 5で接続する。

```tsx
type FullLawReadyLayoutProps = FullLawReaderProps & {
  document: FullLawDocument;
  relationsState: ConfirmedRelationsState;
};

<FullLawReadyLayout
  {...props}
  document={state.document}
  relationsState={relationsState}
/>
```

`FullLawReadyLayout` の引数型を `FullLawReadyLayoutProps` に替え、既存 `</header>` と `<ScrollUrlSync>` の間へ次だけを挿入する。既存の法令名、収録基準日、e-Gov導線は変更しない。

```tsx
{relationsState.status === "error" && (
  <ConfirmedRelationsPartialError onRetry={relationsState.retry} />
)}
```

```tsx
function ConfirmedRelationsPartialError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      role="status"
      className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p className="font-bold">確認済みの関連を取得できませんでした</p>
      <p>法令本文は表示できます。</p>
      <button type="button" onClick={onRetry} className="mt-2 underline">
        関連だけ再試行
      </button>
    </section>
  );
}
```

- [ ] **Step 6: clientテストと型検査を通す**

Run: `cd web && npx vitest run src/__tests__/confirmed-relations-client.test.ts && npx tsc --noEmit`

Expected: PASS。全文ready時に関連loadingが続いても本文型が成立する。

- [ ] **Step 7: Task 4をコミットする**

```bash
git add web/src/lib/relations/confirmed-relations-client.ts web/src/hooks/useConfirmedRelations.ts web/src/__tests__/confirmed-relations-client.test.ts web/src/components/article/FullLawReader.tsx
git commit -m "feat(reader): isolate confirmed relation loading"
```

---

### Task 5: 条ブロック直後へ確認済み関係だけを表示する

**Files:**
- Create: `web/src/components/article/ConfirmedRelationList.tsx`
- Modify: `web/src/components/article/FullLawReader.tsx:75-123`
- Modify: `web/src/components/article/FullLawViewer.tsx:14-63`
- Modify: `web/src/components/article/ChapterArticleBlock.tsx:16-122`
- Create: `web/e2e/confirmed-relations.spec.ts`

**Interfaces:**
- Consumes: Task 2の `ConfirmedRelation`、`RELATION_TYPE_LABELS`、Task 4の `relationsBySource`
- Produces: `<ConfirmedRelationList sourceArticleId relations />`
- Produces: `data-confirmed-relations-for`、`data-confirmed-relation-target` のE2E契約

- [ ] **Step 1: API interceptionで確認済み表示を固定するE2Eテストを書く**

```typescript
// web/e2e/confirmed-relations.spec.ts
import {
  ARTICLE_107_ID,
  TEST_ARTICLE_ID,
  expect,
  test,
} from "./fixtures";

test.describe("確認済みの関連", () => {
  test("本文外の閉じた一覧から新しいタブ用リンクを表示する", async ({ page }) => {
    await page.route(
      "**/api/law-revisions/*/confirmed-relations",
      (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          revisionId: "test-revision",
          relationsBySource: {
            [TEST_ARTICLE_ID]: [{
              id: "confirmed-e2e-1",
              relationType: "DEFINES",
              rationale: "用語定義をあわせて確認するため",
              confirmedAt: "2026-08-02T00:00:00.000Z",
              target: {
                articleId: ARTICLE_107_ID,
                lawName: "建築基準法",
                lawShortName: "建基法",
                articleNumber: "百七",
                caption: "（特殊建築物の内装）",
              },
            }],
          },
        }),
      }),
    );
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    const details = page.locator(
      `[data-confirmed-relations-for="${TEST_ARTICLE_ID}"]`,
    );
    await expect(details).toBeVisible();
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details.getByText("確認済みの関連 1件")).toBeVisible();
    await details.locator("summary").click();
    await expect(details).toContainText("定義");
    await expect(details).toContainText("運営確認済み");
    await expect(details).toContainText("用語定義をあわせて確認するため");
    const link = details.locator("a[data-confirmed-relation-target]");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("関連API失敗時も全文を表示して関連だけ再試行できる", async ({ page }) => {
    await page.route(
      "**/api/law-revisions/*/confirmed-relations",
      (route) => route.fulfill({ status: 500, body: "error" }),
    );
    await page.goto(`/articles/${TEST_ARTICLE_ID}`);
    await expect(page.locator('[data-full-law-ready="true"]')).toBeVisible();
    await expect(
      page.getByText("確認済みの関連を取得できませんでした"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "関連だけ再試行" })).toBeVisible();
  });
});
```

- [ ] **Step 2: E2Eを実行して一覧未実装で失敗することを確認する**

Run: `cd web && npx playwright test e2e/confirmed-relations.spec.ts`

Expected: FAIL。`data-confirmed-relations-for` が見つからない。開発サーバーが必要な場合は別ターミナルで `npm run dev` を先に起動する。

- [ ] **Step 3: 確認済み関係一覧コンポーネントを実装する**

```tsx
// web/src/components/article/ConfirmedRelationList.tsx
import {
  RELATION_TYPE_LABELS,
  type ConfirmedRelation,
} from "@/lib/relations/confirmed-relation";
import { readerArticleHref } from "@/lib/article/full-law-document";
import { formatStructuredNumber } from "@/lib/article/legal-number-format";

export default function ConfirmedRelationList({
  sourceArticleId,
  relations,
}: {
  sourceArticleId: string;
  relations: ConfirmedRelation[];
}) {
  if (relations.length === 0) return null;
  return (
    <details
      data-confirmed-relations-for={sourceArticleId}
      className="mt-4 rounded border border-neutral-200 bg-neutral-50"
    >
      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-neutral-800">
        確認済みの関連 {relations.length}件
      </summary>
      <ul className="space-y-3 border-t border-neutral-200 px-3 py-3">
        {relations.map((relation) => (
          <li key={relation.id} className="text-sm text-neutral-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-bold">
                {RELATION_TYPE_LABELS[relation.relationType]}
              </span>
              <span className="text-xs text-neutral-600">運営確認済み</span>
            </div>
            <a
              href={readerArticleHref(relation.target.articleId)}
              target="_blank"
              rel="noopener noreferrer"
              data-confirmed-relation-target={relation.target.articleId}
              className="mt-1 inline-block font-bold text-[#9d1f58] hover:underline"
            >
              {relation.target.lawShortName ?? relation.target.lawName}
              {relation.target.articleNumber
                ? ` 第${formatStructuredNumber(relation.target.articleNumber)}条`
                : ""}
              {relation.target.caption ? ` ${relation.target.caption}` : ""}
            </a>
            <p className="mt-1 leading-relaxed text-neutral-700">
              {relation.rationale}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: FullLawViewerから条ブロックへ確認済み関係を渡す**

`FullLawViewer` のpropsへ次を追加する。

```typescript
confirmedRelationsBySource: Record<string, ConfirmedRelation[]>;
```

`useMemo` でmapへ変換する。

```typescript
const confirmedBySource = useMemo(
  () => new Map(Object.entries(confirmedRelationsBySource)),
  [confirmedRelationsBySource],
);
```

`ChapterArticleBlock` へ次を渡す。

```tsx
confirmedRelations={confirmedBySource.get(block.article.root.id) ?? []}
```

`ChapterArticleBlockProps` へ `confirmedRelations: ConfirmedRelation[]` を追加し、`.law-body` の直後へ次を置く。

```tsx
<ConfirmedRelationList
  sourceArticleId={articleRoot.id}
  relations={confirmedRelations}
/>
```

`FullLawReader` は関連stateがreadyの場合だけ `relationsState.document.relationsBySource` を渡し、loading/errorでは `{}` を渡す。

```tsx
<FullLawViewer
  document={document}
  targetArticleId={initialArticleId}
  confirmedRelationsBySource={
    relationsState.status === "ready" && relationsState.document
      ? relationsState.document.relationsBySource
      : {}
  }
/>
```

- [ ] **Step 5: E2Eと既存本文リンク回帰を通す**

Run: `cd web && npx playwright test e2e/confirmed-relations.spec.ts e2e/readable-display.spec.ts`

Expected: PASS。既存 `a[data-link-target]` と新しい `a[data-confirmed-relation-target]` がどちらも新規タブ契約を満たす。

- [ ] **Step 6: Task 5をコミットする**

```bash
git add web/src/components/article/ConfirmedRelationList.tsx web/src/components/article/FullLawReader.tsx web/src/components/article/FullLawViewer.tsx web/src/components/article/ChapterArticleBlock.tsx web/e2e/confirmed-relations.spec.ts
git commit -m "feat(reader): show confirmed related articles"
```

---

### Task 6: 全回帰検証、データ漏えい確認、引き継ぎ更新

**Files:**
- Modify: `docs/HANDOFF.md:43-118`

**Interfaces:**
- Consumes: Tasks 1〜5の完成状態
- Produces: 再現可能な検証結果、DB運用注意、次タスク「論点索引」

- [ ] **Step 1: Prisma schemaと差分を再検証する**

Run:

```bash
cd web
npx prisma validate
set -a
source .env
set +a
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: Prisma schemaはvalid。db push済みDBとの差分は0で、migrate diffはexit code 0。

- [ ] **Step 2: webの全単体・統合テストを実行する**

Run: `cd web && npm test`

Expected: 全件PASS。候補・確認済み関係のテスト後にテストUserと関係行が残らない。

- [ ] **Step 3: TypeScriptと本番ビルドを実行する**

Run: `cd web && npx tsc --noEmit && npm run build`

Expected: PASS。Next.jsのroute buildとclient/server境界違反がない。

- [ ] **Step 4: Playwright全件を実行する**

Run: `cd web && npx playwright test`

Expected: 全件PASS。全文、目次、固定アンカー、公式原文コピー、既存本文リンク、確認済み関連、部分失敗が通る。

- [ ] **Step 5: 独立資産srcの回帰を確認する**

Run: `npm test`

Expected: 既存136件を含む全件PASS。`src/`と`blra` DBへ変更がない。

- [ ] **Step 6: 公開経路へ候補語が混入していないことを静的確認する**

Run:

```bash
rg -n "RelatedArticleCandidate|candidateFingerprint|generatorVersion|confidence" web/src/app web/src/components web/src/hooks web/src/lib/relations
```

Expected: 候補固有語は `confirmed-relation-service.ts` と内部テストだけに現れる。公開route、repositoryのSELECT、client、hook、componentには現れない。型名がimportされていたら修正して再検証する。

- [ ] **Step 7: 実ブラウザの通信本数を確認する**

開発サーバーを起動し、建築基準法第1条を開く。初期表示で全文APIと確認済み関係APIが各1回、以後の目次移動とスクロールで確認済み関係APIが追加されないことをDevToolsまたはPlaywright traceで確認する。

Expected: 関連データ0件では「確認済みの関連」を表示しない。実在関係を自動投入しない。

- [ ] **Step 8: HANDOFFを更新する**

`docs/HANDOFF.md` の実装成果へ次を具体的に記録する。

- 既存 `Link` と実務上の関連を分離したこと
- `RelatedArticleCandidate` は非公開、`ConfirmedArticleRelation` だけが公開対象であること
- 新規GET APIと60秒キャッシュ
- 条ブロック直後の閉じた確認済み一覧と部分失敗動作
- Review Queue、自動候補生成、実在関係seedは未実装であること
- `prisma migrate deploy` を引き続き禁止すること
- 実行したVitest、Playwright、TypeScript、build、`src/`テストの結果
- 次タスクを「論点索引」の最小実装へ繰り上げること

- [ ] **Step 9: 最終ドキュメントをコミットする**

```bash
git add docs/HANDOFF.md
git commit -m "docs: hand off confirmed reference relations"
```

- [ ] **Step 10: 最終差分を確認する**

Run: `git status --short && git log --oneline -10`

Expected: 本計画の各成果が小さなコミットに分かれ、開始前からの `AGENTS.md` 変更だけが未stageで残る。
