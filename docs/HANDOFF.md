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

**S1（Corpus Foundation）の M1 完了。M2（e-Gov Parser）着手準備済み。**

S0 は完了済み（ADR-024）。S1 を6マイルストーンに分割し、最初の M1（プロジェクト基盤 + 初期DB + Kysely動作検証）を完了した。

| マイルストーン | 内容 | 期間 | 状態 |
|---|---|---|---|
| M1 | プロジェクト基盤 + 初期DB + Kysely検証 | 1.0週 | **完了** |
| M2 | e-Gov Parser + 条項分割 + canonical_path生成 | 1.5週 | **次** |
| M3 | 取込パイプライン（Fetcher→Raw保存→Parser→Validation） | 1.0週 | 未着手 |
| M4 | Publish API + Source Registry API + 監査 | 0.5週 | 未着手 |
| M5 | 認証基盤（OIDC）+ Admin画面（最小限） | 1.0週 | 未着手 |
| M6 | E2Eテスト + SourceVersion不変性テスト + ドキュメント | 1.0週 | 未着手 |

**S1 Exit条件**: 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行できること。

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

## M2 で実装すること

**e-Gov Parser + 条項分割 + canonical_path生成**

### 参照すべき S0 spike の知見（spikes/ は使い捨てだが知見は再利用）

S0 spike（`spikes/src/`）で F-2 パーサーが抽出率 99.97〜100.00% を達成済み。以下の知見を M2 実装へ引き継ぐ。

1. **e-Gov API v2**（認証不要、`https://laws.e-gov.go.jp/api/2/`）:
   - `/laws?law_title={title}` — 法令検索
   - `/law_revisions/{law_id}` — 版一覧
   - `/law_data/{law_revision_id}` — 本文取得
   - 建築基準法の `law_id`: `325AC0000000201`

2. **法令標準XMLの構造** → 条/項/号 の対応:
   - `Article` → 条（`Num` 属性から `art{N}`、`_` は `-` へ）
   - `Paragraph` → 項（`para{N}`、省略時 `1`）
   - `Item` → 号（`item{N}`）
   - `SupplProvision` → 附則（`AmendLawNum` で名前空間分離。建基法に120個）
   - `AppdxTable`/`AppdxStyle` → 別表・様式

3. **F-2 で発見した重要事項**:
   - 本文は `ParagraphSentence` の外にもある（`TableColumn`, `Column`）。`ParagraphSentence` だけ拾うと約2%を失う
   - ルビ（`Rt`/`Rp`）を除外しないと本文が壊れる（施行規則で28箇所）
   - 附則の `canonical_path` 衝突: `suppl:{amendment_law_id}/art1/para1` で名前空間を切る（S1で `law_revisions` 突合を検証）
   - 別表の `canonical_path`: 連番（`appdx{seq}`）ではなくタイトルから生成（`appdx-table-1`）。F-5 で連番が版間追跡を壊すことを実証済み

4. **抽出率の計測規則**: 分母・分子ともに空白除去後の文字数。残差は制定文（`EnactStatement`）で、条項ではないため取りこぼしではない。

### M2 で実装しないもの（M3 以降）

- e-Gov API への実際のアクセス（M3 の Fetcher）
- DB への書き込み（M3 のパイプライン統合）
- Validation の全項目（M3）
- Publish（M4）

M2 は **Parser の純関数**（XML文字列 → ProvisionSegment[]）を実装し、Fixture Test で検証する。

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
