# 引き継ぎプロンプト（2026-07-30 M5完了時点）

以下をそのまま新しいセッションに貼る。

---

BLRA（建築法令リファレンス）プロジェクトを引き継いでほしい。作業ディレクトリは `/Users/taguchireo/Downloads/blra` です。

## 最初に読むもの（この順で）

1. `README.md` — 現在地と進捗表
2. `docs/design-spec.md` — 設計の正本（**v1.2**、Normative）。これと矛盾する実装をしない
3. `DESIGN.md` — Claude Design 用デザインブリーフ（法令リーダー SCR-03 の要件）
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

**S1 Exit条件**: 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish まで End-to-End で実行できること。
**M5 で認証基盤（Keycloak + OIDC + RBAC + JIT）が完成し、Admin API に認証・認可が組み込まれた。**

## 技術スタック（ADR-022 + ADR-027 + ADR-030、ともに確定済み）

- **言語**: TypeScript / Node 22（ADR-022、ADR-030 で変更しないと明記）
- **HTTP**: Fastify
- **DB**: PostgreSQL 16（Docker Compose、ポート 5433。Homebrew PG が 5432 を占有しているため）
- **DBアクセス**: pg + Kysely（ORM不使用。型安全なSQLビルダ。EXCLUDE制約との組み合わせは M1 で実証済み）
- **マイグレーション**: node-pg-migrate（生SQL。EXCLUDE制約・CHECK・enum を直接記述）
- **検索**: pg_bigm（ADR-027 で確定。OpenSearch・PGroonga は不採用）
- **テスト**: Vitest（123件）
- **認証**: Self-hosted Keycloak (Docker) + openid-client + @fastify/secure-session（M5）
- **フロント**: 素のHTMLフォーム（M5）。React + Vite + TanStack は法令リーダー実装時に導入

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

## M5 で作成したもの

### 認証基盤（OIDC + RBAC）

```
src/auth/                       ← M5 新規
  oidc-client.ts                openid-client 初期化（Issuer.discover + Client）
  session.ts                    @fastify/secure-session 設定（暗号化Cookie）
  routes.ts                     /auth/login, /auth/callback, /auth/logout
  require-roles.ts              preHandler: requireAuth, requireRoles, requireSameOrganization
  provision.ts                  JIT プロビジョニング（初回ログインで app_user 作成）
  types.ts                      SessionUser, OidcUserInfo, hasAnyRole
```

### identity系データモデル（マイグレーション 0007）

```
migrations/0007_identity.ts     organization, app_user, organization_member, role_enum
  - app_user: (oidc_issuer, oidc_sub) 複合一意（OIDC標準・プロバイダ非依存）
  - organization_member: 3組複合主キー（org, user, role）で複数ロール所持可
  - RLS 基盤: organization テーブルのポリシー雛形
  - seed: システム組織・デフォルト組織
```

### 新規・拡張ルート

```
src/routes/
  me.ts                         GET /me（セッションからユーザ情報返却）
  members.ts                    SCR-20: GET/POST/PATCH/DELETE /admin/organizations/:id/members
  admin.ts（拡張）              全エンドポイントに RBAC preHandler 追加 + actor_id 記録
  admin.ts（追加）              GET /admin/source-versions/:id（SCR-12 詳細・can_publish判定）
```

### 素のHTMLフォーム

```
public/
  login.html                    SCR-00 ログイン（Keycloak リダイレクトボタン）
  admin.html                    SCR-10/12/20 統合管理画面（取込・Publish・メンバー管理）
```

### docker-compose.yml 拡張

```
keycloak:
  image: quay.io/keycloak/keycloak:26.0
  command: start-dev
  ports: 8080
  KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}  # .env 参照（§14.2）
```

### テスト（104件 → 123件）

```
tests/auth/rbac.test.ts         RBAC 認可マトリクス（未認証401・権限不足403・ロール別）
tests/routes/me.test.ts         /me エンドポイント
tests/routes/members.test.ts    SCR-20 メンバー管理 API
tests/routes/admin.test.ts（拡張）セッション注入ヘルパー対応
tests/helpers/app.ts（拡張）    setStubSession, createMockSessionUser
tests/helpers/db.ts（拡張）     truncateAll が identity系テーブル + seed 再投入対応
```

### M5 の設計判断（確定済み）

詳細は `docs/superpowers/specs/2026-07-30-s1-m5-auth-admin-design.md` 参照。

- OIDC プロバイダ: Self-hosted Keycloak (Docker)
- OIDC ライブラリ: openid-client（認可コードフロー+PKCE）
- セッション戦略: サーバセッション（@fastify/secure-session・暗号化Cookie）
- Admin UI: **素のHTMLフォーム**（React/Vite/6状態は次フェーズの法令リーダーで導入）
- 列名: `oidc_sub` + `oidc_issuer`（Keycloak 非依存・OIDC標準）
- JIT プロビジョニング: 初回ログインで app_user 自動作成、デフォルト RESEARCHER ロール

## M5 の範囲縮小（確定事項）

Admin UI の「6状態フル実装」と React + Vite + TanStack の新規導入は M5 範囲から外した。理由:

- Admin 画面は Corpus Editor / System Admin 専用（§19.13）で、Solo Track では利用者が1人
- 設計書 ADR-017 / §15.8.2 は Solo Track で UI を削減対象
- S1 Exit 条件は M3 で達成済み

代替: Admin 画面は素の HTML フォーム（Fastify から @fastify/static で配信）。6状態は不要。

フロントエンド基盤（React/Vite/TanStack）の導入は、次の法令リーダー（SCR-03）実装時に行う。リーダーは明朝体・紙面レイアウト・CSS Custom Highlight API・DOM 予算（設計書 §19.22）という固有要件を持つため、管理画面の都合で基盤を決めると作り直しになる。

## 次のタスク: 法令リーダー（SCR-03）

**M5 完了後の次タスクは法令リーダーです。`DESIGN.md` を参照してください。**

法令リーダーは、建築実務者が法令原文を読むための画面。設計書 §19.22 の固有要件（明朝体・紙面レイアウト・CSS Custom Highlight API・DOM 予算）を持つ。ここで React + Vite + TanStack のフロントエンド基盤を導入する。

## 決まっていること（蒸し返さない）

- 設計書 v1.2 の ADR-027〜030 は確定済み
- 正確性の基準（時点表示 99%・重大誤表示 0 件）を体制の軽量化（ADR-025）に合わせて下げない
- 誤った条文を自信を持って表示する実装をしない。時点解決が曖昧なら推測せずエラーにする（§4.2、§18）
- Rule DSL / Compiler / Graph DB / Vector DB / Event Broker に手を出さない（ADR-006、ADR-015）
- 設計書の「削らない4つ」（法令時間モデル / Consolidation State / Citation Anchor / Snapshot 不変性）を工数都合で削らない（ADR-017）
- M5 で Keycloak 固有名を DB スキーマに使わない（oidc_sub + oidc_issuer で OIDC標準）

## 設計書の未記載事項（M1〜M5 で判明・実装時に補完済みまたは要補完）

- ✅ `source.coverage_from` 列: M1 マイグレーションで補完済み
- ✅ 全 enum 型の CREATE TYPE 文: M1 で集約して実装済み
- ⚠️ `source_type_enum` のコード値: `EGOV_LAW` 等を M1 で確定。設計書への反映は未実施
- ⚠️ `audit_record`, `ingestion_job` のDDL: M1 で実装したが設計書への反映は未実施
- ⚠️ `identity`系テーブル（organization, app_user, organization_member）のDDL: M5 で実装。設計書 §13.1 への反映は未実施
- ⚠️ pg ドライバの date型タイムゾーン問題: JST環境で date 型が前日になる。将来 `pg.types.setTypeParser` のカスタマイズを検討

## 並行タスク（Taguchi さん側、S1を止めない）

- [ ] U-1（実務者ヒアリング）。案B の価値提案が成立するかを検証。**n=1 では埋まらない唯一の論点** → `user-research/`
- [ ] ゲート検査者の確保（8〜16時間・任意）→ `docs/domain-reviewer-role.md`

## hourei-rag との関係

`reference/hourei-rag/` に稼働中MVPのコードスナップショットがある（Next.js + React 18）。**コードのみ。設計文書は含めない。** 実装技法の参考にするが、設計判断は blra 設計書 v1.2 を正とする。

hourei-rag は原文座標を DOM 属性（`data-source-start`）として保持するが、blra 設計書 §6.2 はこれを否定し、座標対応表をデータとして持つ方針（ADR-027）。hourei-rag のコードを読むときはこの違いに注意。
