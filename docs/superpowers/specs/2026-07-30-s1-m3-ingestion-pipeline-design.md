# S1 M3: 取込パイプライン設計

- 日付: 2026-07-30
- 対象: S1（Corpus Foundation）M3 — 取込パイプライン（Fetcher→Raw保存→Parser→Validation）
- 親設計: `docs/design-spec.md` v1.2 §8（取込パイプライン）、§4.2（法令時間モデル）、§6.1（Citation Anchor）、§13.1（物理設計）
- 前提: M1（プロジェクト基盤 + 初期DB）、M2（e-Gov Parser 純関数）完了済み

## 1. 目的と範囲

### 1.1 目的

設計書 §8.1 の取込パイプラインを実装し、S1 Exit 条件「最低1法令を End-to-End で取得・構造化・公開できる」を満たす。

M2 の `parse()` は XML文字列 → ProvisionSegment[] の純関数として実装済み。M3 は Fetcher の出力を `parse()` へ渡し、DB書込・Validation・Publish までを繋ぐ。

### 1.2 範囲（M3 で実装するもの）

- **Fetcher**: e-Gov API v2 からの法令XML取得（認証不要、spike で実測済み）
- **Raw Artifact Store**: 原本XMLのローカルファイルシステム保存
- **Hash 比較**: content_hash による前版との同一性判定（§8.2 冪等）
- **DB 書込**: source / source_version / provision / provision_version への書込
- **Validation**: §8.3 のうち M3 で検出可能な項目（抽出率・文字化け）
- **Publish**: validation 結果に応じた `published_at` の設定

### 1.3 範囲外（M4 以降）

- Publish API / Source Registry API（HTTP エンドポイント）— M4
- Reference Extractor（Citation Resolver 経由のエッジ抽出）— Phase 2
- 複数版の順次取込（全 law_revisions ループ）— Phase 2
- Review Queue UI — Phase 2 以降
- S3 / MinIO 等の Object Storage — 必要になった時点で抽象化レイヤを挟んで移行

## 2. 設計判断（確定済み）

ブレインストーミングで以下の判断を確定した。設計書 v1.2 と矛盾しない。

| 判断項目 | 決定 | 理由 |
|---|---|---|
| Raw Artifact Store | ローカルファイルシステム（`data/raw/{sourceId}/{hash}.xml`） | §8.2-2「原本は残す」を最も素直に満たす。`raw_object_key` 列が抽象キーなので将来の S3 移行はコード変更のみ。S1 Exit（1法令E2E）に過剰なインフラ不要 |
| 取込対象の版 | 現行版（latest revision）1つ | M3 の目的はパイプライン完成であり、コーパス充実ではない。Phase 2 まで複数版不要。Fetcher は「1版を取込む」関数とし、呼び出し側で版リストを渡せる形にする |
| M3 の終端 | 自動 Publish まで | S1 Exit が「公開まで」を要求。§8.3「該当版は自動 Publish しない」は Validation と Publish の分岐が一体化していることを示唆。M4 の Publish API は人手介入（再Publish・手動トリガ）向け |
| トリガー方法 | CLI スクリプト（`npm run ingest`） | パイプライン本体は純粋な関数（DBクライアント注入）とし、CLI と将来の HTTP API の両方から呼べる形。E2E テストも CLI 経由で検証可能。M4 の HTTP API はこの関数の薄いラッパー |
| valid_from 導出 | `amendment_enforcement_date` 優先、なければ `amendment_scheduled_enforcement_date`。scheduled は UNDETERMINED | spike の `revision_info` 型定義がこの区別を持つ。§4.2「政令で定める日から施行＝UNDETERMINED」を正確に表現。ESTIMATED は推測日付であり §4.2 精神に合わないため M3 では不使用 |
| content_hash | 原本XML全文の SHA-256 先頭16文字 | §8.1 パイプライン順序（Raw保存→Hash比較→Parser）と一致。実装シンプル。e-Gov API の XML 応答は安定しており誤判定リスク低 |

## 3. アーキテクチャ

### 3.1 全体構成

パイプラインは単一関数 `ingestSourceVersion()` として実装する。設計書 §8.2-6「トランザクション内で Outbox へ書き」に従い、DB書込はアトミック。

```text
ingestSourceVersion(db, lawId, options)
  │
  ├─ 1. Fetcher        fetchLawRevision(lawId) → { xml, revisionInfo, lawInfo }
  ├─ 2. Raw保存        saveRawArtifact(xml, sourceId, hash) → ファイルパス
  ├─ 3. Hash比較       content_hash の既存チェック → 同一なら早期リターン
  ├─ 4. Parser         parse({ xml, jurisdiction, sourceIdentity }) → segments
  ├─ 5. Validation     validatePipeline(...) → errors/warnings
  ├─ 6. DB書込         source / source_version / provision / provision_version
  └─ 7. Publish        validation合格なら published_at = now()
```

### 3.2 設計の要点

1. **`ingestSourceVersion()` は依存注入**。引数に Kysely インスタンス（`db`）と Fetcher を渡す。これにより CLI と将来の HTTP API の両方から呼べる。Fetcher は `fetchLawRevision()` 関数として独立させ、テスト時はモック可能。

2. **DBアクセスは `db/repos/` へ集約**。`pipeline.ts` は SQL を書かず、リポジトリ関数を呼ぶ。パイプラインのロジック（順序・分岐）と DB 操作が分離され、テスト容易性が上がる。

3. **spike の `egov.ts` を再実装**。spike は使い捨てだが知見は再利用。本実装では `fast-xml-parser`（既存依存）を使い、型安全性とエラーハンドリングを強化する。

4. **トランザクション境界**。`db.transaction()` で source_version 書込以降を囲む。Raw保存（FS）はトランザクション外で先に行う（§8.2-2「原本は先に残す」）。DB書込が失敗しても原本は残る。

## 4. モジュール構成

```text
src/
  ingest/                          ← M3 新規
    fetcher.ts                     e-Gov API クライアント（spike egov.ts を本実装へ昇華）
    raw-store.ts                   ローカルFSへの原本保存・読込
    validation.ts                  パイプライン後段のValidation（抽出率・文字化け）
    pipeline.ts                    ingestSourceVersion() — 上記を統合するメイン関数
    types.ts                       FetchResult, IngestOptions, PipelineResult 等
  cli/
    ingest.ts                      ← M3 新規。npm run ingest のエントリ
  config.ts                        ← EGOV_API_BASE を追加
  db/
    repos/                         ← M3 新規。DBアクセスを集約
      source-repo.ts               source / source_version の UPSERT・検索
      provision-repo.ts            provision / provision_version のバルクINSERT
```

## 5. パイプライン詳細

### 5.1 Fetcher（`src/ingest/fetcher.ts`）

e-Gov API v2 から現行版を取得する。spike で実測済みの3エンドポイントを順に呼ぶ。

```typescript
interface FetchResult {
  lawInfo: { lawId: string; lawNum: string; promulgationDate: string };
  revisionInfo: RevisionInfo;  // 施行日・改正情報（§4.2 valid_from 導出の原料）
  xml: string;                 // 法令標準XML全文
}
```

エンドポイント:
1. `GET /api/2/law_revisions/{lawId}` → revisions 配列の最新1件を取得
2. `GET /api/2/law_data/{revisionId}?response_format=xml` → XML本文
3. XML構造バリデーション（`<Law><LawBody><MainProvision>` の存在確認）

エラーハンドリング（§8.2-5 At-Least-Once + hourei-rag 参照）:
- HTTPタイムアウト: 60秒（spike踏襲）
- リトライ: 3回・指数バックオフ（1s→2s→4s）。5xx・ネットワークエラーのみ。4xxは即失敗
- XMLバリデーション失敗: 即例外（リトライしない。構造的欠陥のため）
- e-Gov API への負荷回避: リトライ間にウェイト

### 5.2 Raw Artifact Store（`src/ingest/raw-store.ts`）

```typescript
saveRawArtifact(xml: string, sourceId: string, contentHash: string): Promise<string>
// パス: data/raw/{sourceId}/{contentHash}.xml
// 戻り値: raw_object_key（"325AC.../a1b2c3....xml" 形式の相対パス）
```

- ディレクトリは `source_id` 単位で分割（1法令あたり数百KB〜数MB、版ごとに蓄積）
- ファイル名は `content_hash`（16文字）で一意。同じハッシュなら同じファイル＝上書き不可（冪等）
- `data/raw/` は `.gitignore` へ追加（原本はgit管理外）

### 5.3 Hash比較と冪等性

`UNIQUE(source_id, content_hash)` 制約で版の同一性を判定する。

```typescript
const existing = await findSourceVersionByHash(db, sourceId, contentHash);
if (existing) {
  return { status: "SKIPPED", sourceVersionId: existing.source_version_id };
  // §8.2-1: 同じ入力から同じ出力。以降の処理をスキップ
}
```

並列実行で競合した場合は制約違反例外をキャッチして SKIP 扱い。

### 5.4 Parser

M2 の純関数 `parse()` を変更なしで呼ぶ。Fetcher の `xml` をそのまま渡す。

```typescript
const { output, errors } = parse({
  xml,
  jurisdiction: "jp",
  sourceIdentity: `law/${lawInfo.lawId}`,
});
```

### 5.5 Validation（`src/ingest/validation.ts`）

3層の検証を行い、結果に応じて Publish を分岐させる。

| 層 | 検証内容 | 出所 | 閾値・条件 |
|---|---|---|---|
| Parser層 | Anchor重複・空本文・漢数字残存 | M2 `validateSegments()` | error 1件でもあれば Review 行き |
| 抽出率 | `stats.extractionRate` | M2 `ParseOutput.stats` | **95%未満で warning → Review**。制定文（`EnactStatement`）は分子分母ともに含まれないので、健全なXMLなら99%以上 |
| 文字化け | 本文の文字種異常率 | M3 新規 | 本文に C0制御文字・サロゲートペア単独・BOM が含まれる割合が **0.1%超で warning → Review** |

文字化けチェック（hourei-rag には無い、blra §8.3「文字化けの疑い」向け）:
- C0制御文字（タブ・改行以外）・非BMP文字の単独使用・非法令文字種の高比率をチェック
- encoding破損の典型的な兆候を捉える

Review判定ロジック: error が1件でもある、または warning の数が閾値（10件）超 → `published_at = NULL`（Review Queue 相当）。それ以外 → 自動Publish。

### 5.6 DB書込（`src/db/repos/`）

hourei-rag の upsert + バッチINSERT パターンを参考に、Kysely で実装する。**トランザクション内**で以下の順序で実行:

```text
db.transaction() {
  1. source の UPSERT（canonical_uri で既存判定）
  2. source_version の INSERT（UNIQUE(source_id, content_hash) で重複回避）
  3. provision の UPSERT（UNIQUE(source_id, canonical_path)）
     - 既存の canonical_path があれば再利用、新規ならINSERT
  4. provision_version のバッチINSERT
     - source_version_id と紐付け
     - valid_from / valid_from_status を設定
  5. validation結果に応じて published_at を設定
  6. ingestion_job へ結果を記録
}
```

provision の UPSERT（重要）:
- Kysely の `onConflict().doUpdate()` を使用
- `UNIQUE(source_id, canonical_path)` 制約で既存判定
- 設計書 §6.3「Anchor の版間移行」: 同一 `canonical_path` は `provision_id` を安定させ、異なる版の `provision_version` が同じ `provision_id` を指すようにする。これにより時点比較が可能
- 現行版1つなので今回は新規INSERTのみだが、UPSERTにしておくことで Phase 2 の複数版取込がシームレスになる

provision_version のバッチINSERT:
- 1版あたり数千行。バッチサイズ500で分割（hourei-rag踏襲）

### 5.7 Publish

```typescript
// validation 合格の場合
processing_status = "PUBLISHED";
published_at = new Date();

// validation 要Reviewの場合
processing_status = "PENDING_REVIEW";
published_at = null;  // §8.2-4: Publish前のデータを利用者検索に出さない
```

### 5.8 CLI エントリ（`src/cli/ingest.ts`）

```bash
npm run ingest                    # 建築基準法の現行版を取込
npm run ingest -- 325AC0000000201 # law_id 指定
```

`package.json` へ `"ingest": "tsx src/cli/ingest.ts"` を追加。

## 6. hourei-rag との比較

| 項目 | hourei-rag | blra（本設計） |
|---|---|---|
| DB書込 | Prisma upsert + 生SQL | Kysely upsert + バッチINSERT（**設計書 ADR-022 準拠**） |
| 同一性判定 | 既存行数チェック | `content_hash` の `UNIQUE` 制約（**§8.2 冪等**） |
| チェックサム | JSON→SHA-256 フル hex（本文のみ） | XML全体→SHA-256 16文字（**§8.1 Raw保存→Hash比較の順序**） |
| リンク抽出 | 全件再構築 | **M3 範囲外**（Reference Extractor は Phase 2） |
| トリガー | `npx tsx scripts/ingest.ts` | `npm run ingest`（**M4 で HTTP API へ拡張**） |

hourei-rag から取り入れた技法:
- Fetcher の XML構造バリデーション（`<Law>` / `<MainProvision>` 存在確認）
- e-Gov API への負荷回避ウェイト
- バッチINSERT（サイズ500）
- 冪等性の確保（既存チェック → スキップ）

## 7. テスト戦略

### 7.1 テスト方針

設計書 §8.4「各 Parser は Fixture Test を持つ」をパイプライン全体へ拡張する。M3 は **DB統合テスト（実際のPostgreSQL）** を中心に据える。EXCLUDE制約・UNIQUE制約・トランザクション挙動はモックでは検証できないため（M1 の `exclude-constraint.test.ts` で実証済み）。

### 7.2 テスト構成

```text
tests/
  ingest/
    fetcher.test.ts           Fetcher のテスト（モックHTTP）
    raw-store.test.ts         Raw保存のテスト（実際のFS）
    validation.test.ts        Validation ロジックのテスト（純関数）
    pipeline.test.ts          パイプライン全体の統合テスト（実際のDB）
  fixtures/
    minimal-law.xml           ← M2 から流用（Parser の Fixture）
    mock-egov-responses/      M3 新規。e-Gov API のモックレスポンス
      revisions-325AC0000000201.json
      lawdata-325AC0000000201.xml
```

### 7.3 各テストファイルの内容

**fetcher.test.ts** — Fetcher 単体（HTTPをモック）:

| テストケース | 検証内容 |
|---|---|
| 正常取得 | モックレスポンスから `FetchResult` が正しく組み立てられる |
| XML構造バリデーション | `<Law>` 無し → 例外 |
| タイムアウト | 60秒超で例外（モックで再現） |
| リトライ | 5xx→200 のパターンで3回以内に成功 |
| リトライ上限 | 3回連続5xxで例外 |
| 4xx即失敗 | 404はリトライせず即例外 |

**raw-store.test.ts** — Raw保存単体（実際のFS、一時ディレクトリ）:

| テストケース | 検証内容 |
|---|---|
| 正常保存 | `data/raw/{sourceId}/{hash}.xml` が作成される |
| 冪等保存 | 同じハッシュで2回保存 → ファイル1つ（上書きされない） |
| 読込 | 保存したファイルを復元できる |
| パス生成 | `raw_object_key` の形式が正しい |

**validation.test.ts** — Validation純関数:

| テストケース | 検証内容 |
|---|---|
| 抽出率95%以上 | 正常 → warning無し |
| 抽出率95%未満 | warning 生成 |
| 文字化け検出 | 制御文字混入 → warning |
| 文字化け閾値 | 0.1%以下は正常判定 |
| Review判定 | error 1件 → `shouldPublish = false` |
| 自動Publish | error無し・warning閾値内 → `shouldPublish = true` |

**pipeline.test.ts** — パイプライン統合（実際のDB）:

M3 の Exit Criteria の核心。実際のPostgreSQL（Docker Compose）を使い、Fetcher をモックして `minimal-law.xml` を流し込む。

| テストケース | 検証内容 | 対応する設計書要件 |
|---|---|---|
| E2E正常取込 | XML→source/source_version/provision/provision_version が全て作成される | §8.1 パイプライン完成 |
| 冪等性（同一hash） | 2回目の取込は SKIP、DB行は増えない | §8.2-1 冪等 |
| Published状態 | validation合格版の `published_at` がセットされる | §8.2-4 |
| Pending Review | validation でerror → `published_at = NULL` | §8.3 |
| canonical_path 一意 | 同一 source 内で canonical_path の重複無し | §6.1 |
| EXCLUDE制約 | provision_version の valid期間重複がDBで拒否される | ADR-013（M1検証済み） |
| content_hash 一意 | 同一 source + hash の2件目INSERTが制約で拒否される | §13.1 UNIQUE |
| Raw保存とDBの整合 | `raw_object_key` のファイルが実際に存在する | §8.2-2 原本保存 |
| valid_from_status | 施行日確定版が FIXED、未確定版が UNDETERMINED | §4.2 |

### 7.4 テストデータ

`mock-egov-responses/` の作成方針:
- spike で実際に取得した建築基準法データ（`spikes/out/`）から、テスト用に最小化したモックレスポンスを作成
- `revisions-325AC0000000201.json` — `law_revisions` API のレスポンス模倣（最新版1件）
- `lawdata-325AC0000000201.xml` — `law_data` API のレスポンス模倣（`minimal-law.xml` をラップ）

実際のe-Gov APIには依存しないことで、CI環境・オフラインでもテストが通る。

## 8. S1 Exit Criteria との対応

設計書 §15.4 Phase 1 Exit: 「最低1法令を End-to-End で取得・構造化・公開できる。Raw Source から公開 Provision まで再現できる。SourceVersion 不変性テストが通る。」

| Exit条件 | M3 での検証 |
|---|---|
| 取得 | `fetcher.test.ts` + モックレスポンス |
| 構造化 | M2 Parser テスト（既存） |
| 公開 | `pipeline.test.ts` の Published状態テスト |
| Raw→Provision の再現 | `pipeline.test.ts` の E2E正常取込 |
| SourceVersion 不変性 | EXCLUDE制約・UNIQUE制約テスト（M1拡張） |

手動E2Eデモ: `npm run ingest` で実際の建築基準法を取込 → DB確認。これが S1 Exit の最終確認。

## 9. タイムライン（1.0週）

| 日 | 内容 |
|---|---|
| Day 1-2 | Fetcher（`fetcher.ts` + テスト）、Raw保存（`raw-store.ts` + テスト）、types.ts |
| Day 3 | DBリポジトリ（`source-repo.ts`, `provision-repo.ts`）、Validation（`validation.ts` + テスト） |
| Day 4-5 | パイプライン統合（`pipeline.ts`）、統合テスト（`pipeline.test.ts`） |
| Day 6 | CLI（`cli/ingest.ts`）、実データでのE2Eデモ、`.gitignore` 更新、package.json 更新 |
| Day 7 | バッファ（不具合修正・リファクタ・ドキュメント） |

## 10. リスクと対策

| リスク | 対策 |
|---|---|
| e-Gov API の応答形式がspike時と変わる | モックレスポンスでテスト。実データ確認はDay 6のE2Eデモで検証 |
| Kysely の onConflict で EXCLUDE制約が上手く動かない | M1 で EXCLUDE制約自体は検証済み。UPSERT対象は `provision`（UNIQUE制約）なので問題ない |
| provision_version の valid_from がNULLでEXCLUDE制約が効かない | EXCLUDE制約は `WHERE (valid_from_status = 'FIXED')` の条件付き。UNDETERMINED版は制約対象外で想定通り |
| バッチINSERT のサイズでメモリ問題 | 建基法1版で数千行程度。バッチ500で十分（hourei-rag実績） |
