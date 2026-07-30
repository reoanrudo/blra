# 引き継ぎプロンプト（2026-07-30 時点）

以下をそのまま新しいセッションに貼る。

---

BLRA（建築法令リファレンス）プロジェクトを引き継いでほしい。作業ディレクトリは `/Users/taguchireo/Downloads/blra` です。

## 最初に読むもの（この順で）

1. `README.md` — 現在地と S0 の進捗表
2. `docs/design-spec.md` — 設計の正本（**v1.2**、2,303行、Normative）。これと矛盾する実装をしない
3. `docs/HANDOFF.md` — 本ファイル。前回セッションの成果と次のタスク
4. `git log --oneline` — 各コミットメッセージに発見・実装が要約してある

`docs/research-log.md`（1.1MB）は調査記録であり Informative。設計根拠を辿るとき以外は読まなくてよい。

## 現在地

**S1（Corpus Foundation）の M3 完了。M4（Publish API + Source Registry API）着手準備済み。**

S0 は完了済み（ADR-024）。S1 を6マイルストーンに分割し、M1〜M3 を完了した。
**建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行可能（S1 Exit条件の主要部分を達成）。**

| マイルストーン | 内容 | 期間 | 状態 |
|---|---|---|---|
| M1 | プロジェクト基盤 + 初期DB + Kysely検証 | 1.0週 | **完了** |
| M2 | e-Gov Parser + 条項分割 + canonical_path生成 | 1.5週 | **完了** |
| M3 | 取込パイプライン（Fetcher→Raw保存→Parser→Validation→Publish） | 1.0週 | **完了** |
| M4 | Publish API + Source Registry API + 監査 | 0.5週 | **次** |
| M5 | 認証基盤（OIDC）+ Admin画面（最小限） | 1.0週 | 未着手 |
| M6 | E2Eテスト + SourceVersion不変性テスト + ドキュメント | 1.0週 | 未着手 |

**S1 Exit条件**: 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行できること。
**M3 で E2E デモ成功（建築基準法 2264 条項、抽出率 100%、自動 Publish 済み）。**

## 技術スタック（ADR-022 + ADR-027、ともに確定済み）

- **言語**: TypeScript / Node 22（ADR-022、ADR-030 で変更しないと明記）
- **HTTP**: Fastify
- **DB**: PostgreSQL 16（Docker Compose、ポート 5433。Homebrew PG が 5432 を占有しているため）
- **DBアクセス**: pg + Kysely（ORM不使用。型安全なSQLビルダ）
- **マイグレーション**: node-pg-migrate（生SQL。EXCLUDE制約・CHECK・enum を直接記述）
- **検索**: pg_bigm（ADR-027 で確定。OpenSearch・PGroonga は不採用）
- **テスト**: Vitest
- **フロント**: React + Vite + TanStack（M5以降）

**Kysely + EXCLUDE制約の組み合わせに問題ないことは M1 で実証済み。** ADR-022 の未検証事項は解消した。

## 開発環境

```bash
# PostgreSQL 起動（初回はビルドに数分かかる）
docker compose up -d

# .env を準備
cp .env.example .env

# マイグレーション
npm run migrate

# テスト
npm test

# 型チェック
npm run typecheck

# サーバー起動（ポート3000）
npm run dev
```

**注意**: Homebrew の PostgreSQL がポート 5432 を占有している。Docker 側は 5433 を使用。

## M1 で作成したもの

### データモデル（設計書 §13.1 + §4.6 + §12.3-4）

6テーブル + 7種のenum型:

| テーブル | 役割 | 制約 |
|---|---|---|
| `source` | 法令文書の同一性 | UNIQUE(canonical_uri)。`coverage_from` は §4.6/ADR-019 で第一級（設計書DDL漏れを補完済み） |
| `source_version` | 取得した特定時点の版（不変） | CHECK(valid_from_status), UNIQUE(source_id, content_hash) |
| `provision` | 条項号の同一性 | UNIQUE(source_id, canonical_path) |
| `provision_version` | 特定時点の本文（不変） | **EXCLUDE制約** no_overlapping_validity（ADR-013。btree_gist が必要） |
| `audit_record` | 監査ログ（追記専用） | §12.4 |
| `ingestion_job` | 取込ジョブ | UNIQUE(source_id, idempotency_key) §8.2 |

enum型: `authority_class_enum`, `source_type_enum`, `consolidation_state_enum`, `verification_status_enum`, `valid_from_status_enum`, `provision_type_enum`, `edge_type_enum`

### プロジェクト骨格

```
src/
  config.ts           環境変数読込（dotenv をここで読み込む。ESMのimport順序対応）
  server.ts           Fastify エントリ（/health, /ready のみ）
  migrate.ts          マイグレーション実行スクリプト
  db/
    connection.ts     pg Pool + Kysely インスタンス
    types.ts          Kysely Row 型 + enum の union 型
migrations/
  0001_extensions_and_enums.ts
  0002_source.ts
  0003_source_version.ts
  0004_provision.ts
  0005_provision_version.ts
  0006_operations_tables.ts
tests/
  db/exclude-constraint.test.ts   EXCLUDE制約の動作検証（5テスト全PASS）
docker/
  Dockerfile.postgres  pg_bigm ソースビルド（pgdgにパッケージ無し）
  initdb/00-extensions.sql
```

## M2 + M3 で作成したもの

### M2: e-Gov Parser（純関数）

M2 は **Parser の純関数**（XML文字列 → ProvisionSegment[]）を実装した。spike F-2 パーサーのロジックを本実装へ昇華。抽出率 99.97〜100% を維持。

```
src/parser/
  index.ts           parse() エントリ（XML → ProvisionSegment[]）
  types.ts           ProvisionSegment, ParseInput, ParseOutput, ValidationError 型
  xml-to-tree.ts     fast-xml-parser で LawNode 木へ変換
  segment.ts         LawBody → ProvisionSegment[] 分解 + validateSegments()
  normalize.ts       NFKC正規化 + SHA-256 fingerprint
```

### M3: 取込パイプライン（Fetcher→Raw保存→Parser→Validation→Publish）

M3 は設計書 §8.1 のパイプラインを完成させた。`npm run ingest` で建築基準法1本を E2E で取込・公開できる。

```
src/ingest/
  types.ts           FetchResult, PipelineResult, IngestOptions, ValidFromResult 型
  fetcher.ts         e-Gov API v2 クライアント（リトライ付き・XMLバリデーション）
  raw-store.ts       原本XMLのローカルFS保存・読込（§8.2-2 原本は先に残す）
  hash.ts            content_hash 計算（SHA-256 先頭16文字）
  valid-from.ts      §4.2 valid_from / valid_from_status 導出
  validation.ts      §8.3 抽出率・文字化けチェック + Publish判定
  pipeline.ts        ingestSourceVersion() — 全ステージ統合のメイン関数
src/db/repos/
  source-repo.ts     source / source_version の UPSERT・Hash検索
  provision-repo.ts  provision / provision_version の UPSERT・バッチINSERT
src/cli/
  ingest.ts          npm run ingest エントリ
```

### M3 の設計判断（確定済み・設計書へ反映済み）

設計ドキュメント: `docs/superpowers/specs/2026-07-30-s1-m3-ingestion-pipeline-design.md`
実装計画: `docs/superpowers/plans/2026-07-30-s1-m3-ingestion-pipeline.md`

- **Raw保存**: ローカルFS（`data/raw/{sourceId}/{hash}.xml`）。将来 S3 へ移行可能
- **取込対象**: 現行版（latest revision）1つ。Fetcher は1版を取込む関数（全版ループは Phase 2）
- **終端**: 自動Publishまで。validation合格版は `published_at` セット、要Review版は NULL
- **トリガー**: CLI（`npm run ingest`）。M4 で HTTP API の薄いラッパーを追加
- **valid_from 導出**: `amendment_enforcement_date` → FIXED、なければ UNDETERMINED
- **content_hash**: 原本XML全文の SHA-256 先頭16文字

### M3 の E2E デモ実績（2026-07-30）

```
npm run ingest
  状態: INGESTED（公開済み）
  segment数: 2264
  抽出率: 100.00%
  contentHash: 89311dd9768f73eb
```

DB: source 1件、source_version 1件（PUBLISHED）、provision 2264件、provision_version 2264件。冪等性確認済み（2回目は SKIP）。

### M3 で実装しないもの（M4 以降）

- Publish API / Source Registry API（HTTP エンドポイント）— M4
- Reference Extractor（Citation Resolver 経由のエッジ抽出）— Phase 2
- 複数版の順次取込（全 law_revisions ループ）— Phase 2
- Review Queue UI — Phase 2 以降

## 決まっていること（蒸し返さない）

- 設計書 v1.2 の ADR-027（DOMに座標を持たせない）、ADR-028（トークン単位のDOM生成禁止）、ADR-029（クライアント一括配信は測定待ち）、ADR-030（言語変更しない）は確定済み
- 正確性の基準（時点表示 99%・重大誤表示 0 件）を体制の軽量化（ADR-025）に合わせて下げない
- 誤った条文を自信を持って表示する実装をしない。時点解決が曖昧なら推測せずエラーにする（設計書 §4.2、§18）
- Rule DSL / Compiler / Graph DB / Vector DB / Event Broker に手を出さない（ADR-006、ADR-015）
- 設計書の「削らない4つ」（法令時間モデル / Consolidation State / Citation Anchor / Snapshot 不変性）を工数都合で削らない（ADR-017）

## hourei-rag との関係

`reference/hourei-rag/` に稼働中MVP（hourei-rag）のコードスナップショットがある。**コードのみ。設計文書は含まない。** 実装技法の参考にするが、設計判断は blra 設計書 v1.2 を正とする。

hourei-rag は原文座標を DOM 属性（`data-source-start`）として保持するが、blra 設計書 §6.2 はこれを否定し、座標対応表をデータとして持つ方針（ADR-027）。hourei-rag のコードを読むときはこの違いに注意。

## 設計書の未記載事項（M1 で判明・実装時に補完済みまたは要補完）

- ✅ `source.coverage_from` 列: §4.6 で第一級概念だが §13.1 のDDLに漏れ。M1 マイグレーションで補完済み
- ✅ 全 enum 型の CREATE TYPE 文: 設計書に値のリストが散在。M1 で集約して実装済み
- ⚠️ `source_type_enum` のコード値: 設計書 §8.4 は形式名のみ。`EGOV_LAW` 等のコード値を M1 で確定した。設計書への反映は未実施
- ⚠️ `audit_record`, `ingestion_job` のDDL: 設計書に構造記述のみ。M1 で実装したが設計書への反映は未実施
- ⚠️ pg ドライバの date型タイムゾーン問題: JST環境で date 型が前日になる。将来 `pg.types.setTypeParser` のカスタマイズを検討

## 並行タスク（Taguchi さん側、S1を止めない）

- [ ] U-1（実務者ヒアリング）。案B の価値提案が成立するかを検証。**n=1 では埋まらない唯一の論点** → `user-research/`
- [ ] ゲート検査者の確保（8〜16時間・任意）→ `docs/domain-reviewer-role.md`
