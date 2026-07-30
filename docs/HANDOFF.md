# 引き継ぎプロンプト（2026-07-30 M5完了時点・次タスク=法令リーダー）

以下をそのまま新しいセッションに貼る。

---

BLRA（建築法令リファレンス）プロジェクトを引き継いでほしい。作業ディレクトリは `/Users/taguchireo/Downloads/blra` です。

## 最初に読むもの（この順で）

1. `README.md` — 現在地と進捗表
2. `docs/design-spec.md` — 設計の正本（**v1.2**、Normative）。これと矛盾する実装をしない
3. `DESIGN.md` — **法令リーダーのデザインブリーフ（次タスクの核心）。必ず最初に通読すること**
4. `docs/HANDOFF.md` — 本ファイル。前回セッションの成果と次のタスク
5. `git log --oneline` — 各コミットメッセージに発見・実装が要約してある

`docs/research-log.md`（1.1MB）は調査記録であり Informative。設計根拠を辿るとき以外は読まなくてよい。

## 現在地

**S1（Corpus Foundation）の M5 完了。次は法令リーダー（SCR-03）の実装。**

S0 は完了済み（ADR-024）。S1 を6マイルストーンに分割し、M1〜M5 を完了した。
**建築基準法1本を e-Gov API → 取込 → 構造化 → Publish → 認証・認可付き HTTP API 経由で参照・操作できる。**

| マイルストーン | 内容 | 期間 | 状態 |
|---|---|---|---|
| M1 | プロジェクト基盤 + 初期DB + Kysely検証 | 1.0週 | **完了** |
| M2 | e-Gov Parser + 条項分割 + canonical_path生成 | 1.5週 | **完了** |
| M3 | 取込パイプライン（Fetcher→Raw保存→Parser→Validation→Publish） | 1.0週 | **完了** |
| M4 | Publish API + Source Registry API + 監査 | 0.5週 | **完了** |
| M5 | 認証基盤（OIDC + RBAC）+ 素のHTMLフォーム | 1.0週 | **完了** |
| M6 | E2Eテスト + SourceVersion不変性テスト + ドキュメント | 1.0週 | 未着手 |

**S1 Exit条件**: 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行できること。**M5 で達成済み。**

## 技術スタック（確定済み）

- **言語**: TypeScript / Node 22（ADR-022、ADR-030 で変更しないと明記）
- **HTTP**: Fastify
- **DB**: PostgreSQL 16（Docker Compose、ポート 5433。Homebrew PG が 5432 を占有しているため）
- **DBアクセス**: pg + Kysely（ORM不使用。型安全なSQLビルダ）
- **マイグレーション**: node-pg-migrate（生SQL）
- **検索**: pg_bigm（ADR-027）
- **テスト**: Vitest（123件）
- **認証**: Self-hosted Keycloak (Docker) + openid-client + @fastify/secure-session（M5）
- **フロント**: **素のHTMLフォーム（M5時点）。法令リーダー実装で React + Vite + TanStack を導入する**

## 開発環境

```bash
docker compose up -d      # PostgreSQL（5433）+ Keycloak（8080）起動
cp .env.example .env      # .env 準備（KEYCLOAK_ADMIN_PASSWORD 等を設定）
npm run migrate           # マイグレーション（0001〜0007）
npm test                  # テスト（123件・Vitest）
npm run typecheck         # 型チェック
npm run dev               # サーバー起動（ポート3000）
npm run ingest            # 建築基準法の取込（M3 パイプライン）
```

## 次のタスク: 法令リーダー（SCR-03）

### 概要

建築実務者が法令原文を読むための画面。紙の『建築基準法関係法令集』をデジタルに置き換えるもの。**Notion や一般的なドキュメントビューアの見た目にしない。** 机の上に開いた法令集そのものを目指す。

### 必須資料

1. **`DESIGN.md`** — デザインブリーフ（配色・書体・レイアウト・固有UI）。**必ず最初に通読。**
2. **設計書 §19.10（行1885-1953）** — SCR-03 法令リーダーの実装仕様（最も詳細）
3. **設計書 §19.22（行2236-2303）** — レンダリング戦略と性能予算（DOM予算・CSS Custom Highlight API）
4. **設計書 §6.2（行432-474）** — 原文座標の分離（DOM属性方式を否定・座標対応表方式）
5. **設計書 §19.14（行2007-2016）** — 6状態設計の共通規約

### 実装の主要要件

#### フロントエンド基盤の導入（最初にやること）
- **React + Vite + TanStack Query/Router** を新規導入
- `web/` ディレクトリにプロジェクト作成
- Vite dev proxy で Fastify（:3000）へ転送（Cookie付き fetch・同一オリジン）
- M5 で導入した素のHTMLフォーム（`public/login.html`, `public/admin.html`）は残置

#### 視覚デザイン（DESIGN.md から厳密に再現）
- **本文は明朝体**（`Hiragino Mincho ProN` / `Yu Mincho` / `Noto Serif JP`）。ゴシック本文は禁止
- **紙色の背景**（`#FFFDF8`）。純白ではない
- **2色刷り**（黒＋マゼンタ寄りの赤 `#D92F7E`）。条見出し・章節見出しが赤
- **柱（ランニングヘッダー）**。紙面上部に法令名と現在の章節
- **カード化しない**。条文を角丸カードに入れると文書の連続性が消える
- **影は紙面の外周のみ**

#### 固有UI要素（一般的なビューアにはない・省略不可）
1. **適用時点バー**（常時表示）— 「確認申請日」「着工日」「現在」等の切替。日付を隠さない（原則5）
2. **出典バッジ** — `[法律] [2025-04-01 施行版] [官報確認済]`。色だけでなく文字ラベル必須
3. **注意帯（NoticeBand）** — 経過措置・未施行改正の通知。6種の優先順序（§19.10.3）
4. **本文中の参照（3状態）** — 確認済み（赤下線）/ 未確認候補（点線）/ 未解決（下線なし・右ペインへ列挙）
5. **サポートペイン「関連」** — 型ラベル付き（委任先/定義/例外/参照）。無ラベル一覧禁止（§19.5）
6. **線引き（ハイライト）** — CSS Custom Highlight API（§19.22.3）。DOM変更なし

#### ハードな性能制約（§19.22.2 + §6.2.3）
- **本文トークンごとにDOM要素を生成しない** — 原文座標はデータ側の対応表で保持（§6.2）
- **章全体のDOMを一度にmaterializeしない** — 可視範囲外は仮想化でDOMから外す
- **認証内側の法令本文をSSRしない** — SEO利益なくhydration費用のみ残る（ADR-028）
- **本文以外のメタデータを本文と同一ペイロードで送らない** — 遅延取得
- **ハイライトはCSS Custom Highlight APIのみ** — span包囲方式禁止。非対応環境は機能縮退
- **CI計測が義務**（§19.22.5） — DOMノード数・ペイロード比率・応答内訳。予算超過はバグ

#### 6状態設計（§19.14）
標準/空/読込中/部分失敗/全体失敗/権限不足を実装。特に:
- **部分失敗でも本文は隠さない** — 本文が出せて関連が出せない場合、本文表示＋関連欄にエラー
- **読込中** — 300ms以内の操作にスケルトンを出さない
- **権限不足** — 機能は見せて理由を示す。存在推測のできる表示はしない

### 既存バックエンドAPI（法令リーダーが使うもの）

```
GET /provisions/:id                    条文取得
GET /provisions/:id/at?date=&anchorId= 時点解決
GET /provisions/:id/history            版履歴
GET /provisions/:id/references         参照エッジ
GET /provisions/:id/diff?from=&to=     差分
GET /sources                           法令一覧
GET /sources/:id                       法令詳細
GET /sources/:id/versions              版一覧
GET /me                                現在ユーザ（認証状態確認）
```

M5 時点で `/provisions/:id`, `/sources`, `/sources/:id`, `/sources/:id/versions` は実装済み。
`/provisions/:id/at`, `/provisions/:id/history`, `/provisions/:id/references`, `/provisions/:id/diff` は未実装（必要に応じて追加）。

### やってはいけないこと（DESIGN.md より）

1. 本文をゴシック体にしない。明朝が正
2. 条文を角丸カードに入れない
3. 適用時点の日付を隠さない。折りたたみやホバー表示にしない
4. 出典バッジを色だけで区別しない。必ず文字ラベルを併記
5. 本文の中に別のスクロール領域を作らない。主スクロールは1つ
6. 紫やグラデーション、絵文字アイコンを使わない
7. ダークモードは作らない

### アプローチの提案

法令リーダーは規模が大きいため、以下の順で段階的に実装することを推奨:

1. **Week 1**: フロントエンド基盤導入（React+Vite+TanStack）+ 静的デザインの再現（DESIGN.md 通りの紙面・明朝体・配色）+ サンプルデータでの表示
2. **Week 2**: 既存APIへの接続 + 6状態インフラ + 適用時点バー・出典バッジ・参照3状態
3. **Week 3**: CSS Custom Highlight API（ハイライト）+ サポートペイン + 仮想化・DOM予算対応

新しいセッションの冒頭で EnterPlanMode を使い、スコープと優先順位を確定してから実装に入ること。

## M1〜M5 で作成したもの（概要）

### バックエンド（src/）
- `config.ts` — 環境変数読込（M5: OIDC/Keycloak設定）
- `app.ts` — Fastify アプリ構築（M5: セッション・認証・静的配信）
- `auth/` — 認証基盤（M5: OIDC, session, RBAC, JIT）
- `routes/` — corpus（参照系）, admin（書き込み系+監査）, me, members
- `db/` — connection, types, repos/（source, provision, audit, user, member）
- `parser/` — e-Gov Parser（M2: XML→ProvisionSegment[]）
- `ingest/` — 取込パイプライン（M3: Fetcher→Raw保存→Parser→Validation→Publish）
- `http/` — errors, meta（§12.2 API メタデータ）

### データモデル（migrations/ 0001〜0007）
- `source`, `source_version`, `provision`, `provision_version` — コーパス系
- `audit_record`, `ingestion_job` — 運用系
- `organization`, `app_user`, `organization_member` — identity系（M5）
  - `app_user`: `(oidc_issuer, oidc_sub)` 複合一意（OIDC標準・プロバイダ非依存）

### フロントエンド
- `public/login.html`, `public/admin.html` — 素のHTMLフォーム（M5。React導入後も残置）
- `web/` — **未作成。法令リーダー実装で新規作成。**

### テスト（123件）
- `tests/parser/` — M2 Parser（26件）
- `tests/ingest/` — M3 パイプライン（34件）
- `tests/db/` — DB・リポジトリ（11件）
- `tests/routes/` — corpus, admin, me, members（42件）
- `tests/auth/` — RBAC（10件）

## 決まっていること（蒸し返さない）

- 設計書 v1.2 の ADR-027〜030 は確定済み
- 正確性の基準（時点表示 99%・重大誤表示 0 件）を体制の軽量化（ADR-025）に合わせて下げない
- 誤った条文を自信を持って表示する実装をしない。時点解決が曖昧なら推測せずエラーにする（§4.2、§18）
- Rule DSL / Compiler / Graph DB / Vector DB / Event Broker に手を出さない（ADR-006、ADR-015）
- 設計書の「削らない4つ」（法令時間モデル / Consolidation State / Citation Anchor / Snapshot 不変性）を工数都合で削らない（ADR-017）
- M5 で Keycloak 固有名を DB スキーマに使わない（`oidc_sub` + `oidc_issuer` で OIDC標準）
- M5 Admin UI を素のHTMLフォームに縮小（[ADR-030](docs/adr/ADR-030-m5-admin-ui-scope-reduction.md)）。フロントエンド基盤は法令リーダーで導入

## 宿題（M6 または S3 で対応）

- **RLS テストの検証抜け**（[ADR-030 残課題](docs/adr/ADR-030-m5-admin-ui-scope-reduction.md#残課題-rls-テストの検証抜けm5-監査にて指摘)参照）: 現在の123件テストは `app.current_org` 未設定で走っており、RLS が効いている状態の挙動を一度も確かめていない。実害ゼロ（対象 `organization` 1テーブル・project/evidence 系は S3 以降）だが、「テストが通っている」を RLS 動作確認と誤解しないこと。T-03（テナント分離テスト）に相当する1本を M6 で追加推奨

## 設計書の未記載事項（実装時に補完済みまたは要補完）

- ✅ `source.coverage_from` 列: M1 マイグレーションで補完済み
- ✅ 全 enum 型の CREATE TYPE 文: M1 で集約して実装済み
- ⚠️ `source_type_enum` のコード値: `EGOV_LAW` 等を M1 で確定。設計書への反映は未実施
- ⚠️ `identity`系テーブルのDDL: M5 で実装。設計書 §13.1 への反映は未実施
- ⚠️ pg ドライバの date型タイムゾーン問題: JST環境で date 型が前日になる。将来 `pg.types.setTypeParser` のカスタマイズを検討

## 並行タスク（Taguchi さん側、S1を止めない）

- [ ] U-1（実務者ヒアリング）。案B の価値提案が成立するかを検証 → `user-research/`
- [ ] ゲート検査者の確保（8〜16時間・任意）→ `docs/domain-reviewer-role.md`

## hourei-rag との関係

`reference/hourei-rag/` に稼働中MVPのコードスナップショットがある（Next.js + React 18）。**コードのみ。設計文書は含めない。** 実装技法の参考にするが、設計判断は blra 設計書 v1.2 を正とする。

hourei-rag は原文座標を DOM 属性（`data-source-start`）として保持するが、blra 設計書 §6.2 はこれを否定し、座標対応表をデータとして持つ方針（ADR-027）。hourei-rag のコードを読むときはこの違いに注意。
