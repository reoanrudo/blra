# 引き継ぎプロンプト（2026-07-30 M4完了時点）

以下をそのまま新しいセッションに貼る。

---

BLRA（建築法令リファレンス）プロジェクトを引き継いでほしい。作業ディレクトリは `/Users/taguchireo/Downloads/blra` です。

## 最初に読むもの（この順で）

1. `README.md` — 現在地と進捗表
2. `docs/design-spec.md` — 設計の正本（**v1.2**、Normative）。これと矛盾する実装をしない
3. `docs/HANDOFF.md` — 本ファイル。前回セッションの成果と次のタスク
4. `git log --oneline` — 各コミットメッセージに発見・実装が要約してある

`docs/research-log.md`（1.1MB）は調査記録であり Informative。設計根拠を辿るとき以外は読まなくてよい。

## 現在地

**S1（Corpus Foundation）の M4 完了。M5（認証基盤 OIDC + Admin画面最小限）着手準備済み。**

S0 は完了済み（ADR-024）。S1 を6マイルストーンに分割し、M1〜M4 を完了した。
**建築基準法1本を e-Gov API → 取込 → 構造化 → Publish → HTTP API 経由で参照・操作できる（S1 Exit条件をほぼ達成）。**

| マイルストーン | 内容 | 期間 | 状態 |
|---|---|---|---|
| M1 | プロジェクト基盤 + 初期DB + Kysely検証 | 1.0週 | **完了** |
| M2 | e-Gov Parser + 条項分割 + canonical_path生成 | 1.5週 | **完了** |
| M3 | 取込パイプライン（Fetcher→Raw保存→Parser→Validation→Publish） | 1.0週 | **完了** |
| M4 | Publish API + Source Registry API + 監査 | 0.5週 | **完了** |
| M5 | 認証基盤（OIDC）+ Admin画面（最小限） | 1.0週 | **次** |
| M6 | E2Eテスト + SourceVersion不変性テスト + ドキュメント | 1.0週 | 未着手 |

**S1 Exit条件**: 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行できること。
**M4 で HTTP API 7エンドポイントが完成し、curl/ブラウザから法令データの参照・取込トリガー・Publish・監査ログ検索が可能。**

## 技術スタック（ADR-022 + ADR-027、ともに確定済み）

- **言語**: TypeScript / Node 22（ADR-022、ADR-030 で変更しないと明記）
- **HTTP**: Fastify
- **DB**: PostgreSQL 16（Docker Compose、ポート 5433。Homebrew PG が 5432 を占有しているため）
- **DBアクセス**: pg + Kysely（ORM不使用。型安全なSQLビルダ。EXCLUDE制約との組み合わせは M1 で実証済み）
- **マイグレーション**: node-pg-migrate（生SQL。EXCLUDE制約・CHECK・enum を直接記述）
- **検索**: pg_bigm（ADR-027 で確定。OpenSearch・PGroonga は不採用）
- **テスト**: Vitest（104件）
- **フロント**: React + Vite + TanStack（M5で導入）

## 開発環境

```bash
docker compose up -d      # PostgreSQL 起動（ポート5433。初回は pg_bigm ビルドで数分）
cp .env.example .env      # .env 準備
npm run migrate           # マイグレーション
npm test                  # テスト（104件・Vitest）
npm run typecheck         # 型チェック
npm run dev               # サーバー起動（ポート3000）
npm run ingest            # 建築基準法の取込（M3 パイプライン）
```

## M1〜M4 で作成したもの

### データモデル（M1・設計書 §13.1）

6テーブル + 7種のenum型: `source`, `source_version`, `provision`, `provision_version`（EXCLUDE制約・btree_gist必要）, `audit_record`, `ingestion_job`

### M2: e-Gov Parser（純関数）

```
src/parser/
  index.ts           parse() エントリ（XML → ProvisionSegment[]）
  types.ts           ProvisionSegment, ParseInput, ParseOutput, ValidationError 型
  xml-to-tree.ts     fast-xml-parser で LawNode 木へ変換
  segment.ts         LawBody → ProvisionSegment[] 分解 + validateSegments()
  normalize.ts       NFKC正規化 + SHA-256 fingerprint
```

### M3: 取込パイプライン

```
src/ingest/
  types.ts, fetcher.ts, raw-store.ts, hash.ts, valid-from.ts, validation.ts, pipeline.ts
src/db/repos/
  source-repo.ts     source / source_version の UPSERT・Hash検索
  provision-repo.ts  provision / provision_version の UPSERT・バッチINSERT
src/cli/
  ingest.ts          npm run ingest エントリ
```

### M4: Publish API + Source Registry API + 監査

```
src/app.ts                 buildApp() — Fastify アプリ構築（テストで inject() 可能）
src/server.ts              エントリポイント（buildApp を呼ぶ薄いラッパ）
src/routes/corpus.ts       GET /sources, /sources/:id, /sources/:id/versions, /provisions/:id
src/routes/admin.ts        POST /admin/ingest, POST /admin/source-versions/:id/publish, GET /admin/audit
src/db/repos/audit-repo.ts 監査レコード書込・検索
src/http/meta.ts           レスポンス meta ラッパー（§12.2 必須メタデータ）
src/http/errors.ts         エラーレスポンス正規化 + UUID バリデーション
tests/helpers/             db.ts, app.ts（共通テストヘルパー）
tests/routes/              corpus.test.ts, admin.test.ts
tests/db/repos/            audit-repo.test.ts
```

**M4 の設計判断（確定済み）**: 詳細は `docs/superpowers/specs/2026-07-30-s1-m3-ingestion-pipeline-design.md` 参照。

- 取込APIは同期待ち（M6で非同期化可能）
- APIプレフィックスなし（設計書 §12.2 に忠実）
- 認証はスタブ（actor_id=NULL で監査記録。**M5 で OIDC 認証導入時に拡張**）
- Fastify 標準 JSON Schema（ajv）でバリデーション。`attachValidation: true` でハンドラ内処理
- 参照系は `published_at IS NOT NULL` のみ返す（§5.3制約）

### M4 の E2E デモ実績（2026-07-30）

```
npm run ingest → 2264条項、100%抽出、自動Publish
GET /sources → 建築基準法1件
GET /provisions/:id → 第一条の現行版
GET /admin/audit → 監査ログ検索（action フィルタ動作確認）
```

## M5 で実装すること（次のタスク）

**認証基盤（OIDC）+ Admin画面（最小限）**

### M5 の設計要件（設計書から）

設計書 §14.2（行1277-1278）: **Managed OIDC** による認証、組織単位の RBAC ＋ PostgreSQL RLS。

設計書 §12.3（行1019-1032）の5ロール:
- `CORPUS_EDITOR` — SourceVersion の Publish（自社運用のみ）。Admin API の主体。
- `SYSTEM_ADMIN` — システム運用。法令内容の承認権限は自動的には持たない。
- `ORGANIZATION_ADMIN`, `RESEARCHER`, `REVIEWER` も定義。

設計書 §19.3 + §19.13 で S1 フェーズに割り当てられた画面:
- **SCR-00 ログイン**（Managed OIDC へのリダイレクト）
- **SCR-10 取込ダッシュボード**（最小版）
- **SCR-12 SourceVersion 詳細/Publish**
- **SCR-20 組織・メンバー管理**（最小版）

### M5 で拡張すべき M4 コード

1. **`audit-repo.ts` の `InsertAuditRecordParams`**: `actorId`, `organizationId` を追加（スキーマは対応済み）
2. **`admin.ts` 各エンドポイント**: 認証済みユーザーから actorId を取得して監査記録へ渡す
3. **`app.ts`**: 認証ミドルウェア（preHandler/onRequest）を追加。Admin ルートにロールチェック
4. **`/me` エンドポイント**: §19.18.3 の `auth → OIDC / me` に対応

### ⚠️ M5 着手前に決めるべき未確定事項

**設計書・ADR に未記載の判断が4つある。M5 計画（EnterPlanMode）で決定する:**

1. **OIDC プロバイダ**: Auth0 / Cognito / Keycloak のいずれか（設計書は「Managed OIDC」のみ）
2. **OIDC ライブラリ/フロー**: `@fastify/passport`+OIDC / `openid-client` / 自前実装。認可コードフロー+PKCE を想定
3. **セッション戦略**: Cookie/Session vs JWT（設計書に指定なし）
4. **Admin UI の作り込み度**: 設計スタイル（§19.14 の6状態実装等）をどこまで M5 でやるか

**RLS は M5 では最小限**: §12.3 の RLS は project/evidence 系（S3）が対象。M5 では基盤（ポリシー雛形・ロール enum・セッション→actor の結線）のみ。コーパス系テーブル（source 等）はテナント非対象で RLS 不要。

## 決まっていること（蒸し返さない）

- 設計書 v1.2 の ADR-027〜030 は確定済み
- 正確性の基準（時点表示 99%・重大誤表示 0 件）を体制の軽量化（ADR-025）に合わせて下げない
- 誤った条文を自信を持って表示する実装をしない。時点解決が曖昧なら推測せずエラーにする（§4.2、§18）
- Rule DSL / Compiler / Graph DB / Vector DB / Event Broker に手を出さない（ADR-006、ADR-015）
- 設計書の「削らない4つ」（法令時間モデル / Consolidation State / Citation Anchor / Snapshot 不変性）を工数都合で削らない（ADR-017）

## 設計書の未記載事項（M1 で判明・実装時に補完済みまたは要補完）

- ✅ `source.coverage_from` 列: M1 マイグレーションで補完済み
- ✅ 全 enum 型の CREATE TYPE 文: M1 で集約して実装済み
- ⚠️ `source_type_enum` のコード値: `EGOV_LAW` 等を M1 で確定。設計書への反映は未実施
- ⚠️ `audit_record`, `ingestion_job` のDDL: M1 で実装したが設計書への反映は未実施
- ⚠️ pg ドライバの date型タイムゾーン問題: JST環境で date 型が前日になる。将来 `pg.types.setTypeParser` のカスタマイズを検討

## 並行タスク（Taguchi さん側、S1を止めない）

- [ ] U-1（実務者ヒアリング）。案B の価値提案が成立するかを検証。**n=1 では埋まらない唯一の論点** → `user-research/`
- [ ] ゲート検査者の確保（8〜16時間・任意）→ `docs/domain-reviewer-role.md`

## hourei-rag との関係

`reference/hourei-rag/` に稼働中MVPのコードスナップショットがある（Next.js + React 18）。**コードのみ。設計文書は含めない。** 実装技法の参考にするが、設計判断は blra 設計書 v1.2 を正とする。

hourei-rag は原文座標を DOM 属性（`data-source-start`）として保持するが、blra 設計書 §6.2 はこれを否定し、座標対応表をデータとして持つ方針（ADR-027）。hourei-rag のコードを読むときはこの違いに注意。
