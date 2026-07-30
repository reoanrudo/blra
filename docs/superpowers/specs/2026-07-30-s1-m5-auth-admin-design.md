# S1 M5: 認証基盤（OIDC）+ Admin画面（6状態フル）設計

- 日付: 2026-07-30
- 対象: S1（Corpus Foundation）M5 — 認証基盤 + Admin画面
- 親設計: `docs/design-spec.md` v1.2 §12.3（ロール）、§14.2（セキュリティ）、§19.3/§19.13/§19.14（画面・状態設計）、§19.18.3（auth feature）
- 前提: M1〜M4 完了（HTTP API 7エンドポイント・テスト104件・認証スタブ actor_id=NULL）

## 1. 目的と範囲

### 1.1 目的

設計書 §14.2「Managed OIDC による認証、組織単位の RBAC ＋ PostgreSQL RLS」を実装し、Admin API に認証・認可を組み込む。併せて §19.3 + §19.13 で S1 フェーズに割り当てられた4画面（SCR-00, SCR-10, SCR-12, SCR-20）を6状態フル実装で構築する。

### 1.2 範囲（M5 で実装するもの）

**バックエンド:**
- Self-hosted Keycloak（Docker Compose 追加）
- OIDC 認可コードフロー + PKCE（`openid-client`）
- サーバセッション（`@fastify/secure-session`、暗号化Cookie）
- JIT（Just-In-Time）ユーザプロビジョニング
- RBAC preHandler（ロール別エンドポイントガード）
- identity系テーブル: `organization`, `app_user`, `organization_member`, `role_enum`
- `audit-repo.ts` 拡張（actorId / organizationId 記録）
- `/me`, `/admin/organizations/:id/members` 系エンドポイント新規
- RLS 基盤（`organization` テーブルのポリシー雛形 + セッション変数結線）

**フロントエンド（縮小版）:**
- 素のHTMLフォーム（Fastify から `@fastify/static` で配信）
- SCR-00 ログイン、SCR-10 取込ダッシュボード、SCR-12 SourceVersion 詳細/Publish、SCR-20 組織・メンバー管理
- 6状態フル実装は範囲外。認証・認可・監査が動いていることが確認できれば M5 完了
- **React + Vite + TanStack の導入は次フェーズ（法令リーダー SCR-03 実装時）に延期**

> **範囲縮小の理由**: Admin 画面は Corpus Editor / System Admin 専用（§19.13）で、Solo Track（§15.8）では利用者が1人。ADR-017 / §15.8.2 は Solo Track で UI を削減対象としている。S1 Exit 条件（建築基準法1本のE2E公開）は M3 で達成済み。フロントエンド基盤は法令リーダー（明朝体・紙面レイアウト・CSS Custom Highlight API・DOM 予算 §19.22）の固有要件があるため、管理画面の都合で基盤を決めると作り直しになる。

### 1.3 範囲外（M6 / S2 以降）

- 招待メール送信フロー（SCR-20 は既存 app_user のみ追加可能）
- project / evidence 系テーブルの RLS（テーブル自体が S3 以降に作成）
- コーパス系テーブル（source, provision 等）の RLS（テナント非対象）
- OIDC の実Keycloakを使った E2E テスト（M5 は openid-client モック、M6 で実施）
- セッションの DB-backed store（インメモリ/@fastify/secure-session のみ）
- SLO / ログアウト / refresh_token の高度な管理

## 2. 設計判断（確定済み）

ブレインストーミングで以下の判断を確定した。設計書 v1.2 と矛盾しない。

| 判断項目 | 決定 | 理由 |
|---|---|---|
| **OIDC プロバイダ** | Self-hosted Keycloak (Docker) | 外部サービス依存ゼロ・オフライン開発可能。docker-compose.yml への追加で既存構成と親和性高い |
| **OIDC ライブラリ** | `openid-client` | Node.js で最も標準的。認可コードフロー+PKCE を完全サポート。学習資料豊富 |
| **セッション戦略** | サーバセッション（Cookie） | `@fastify/secure-session` で暗号化Cookie。BFF パターンで React は Cookie 付き fetch のみ |
| **Admin UI 作り込み度** | 素のHTMLフォーム（6状態フル実装は次フェーズへ延期） | Solo Track では利用者1人。React/Vite/TanStack 基盤は法令リーダーの固有要件に合わせて導入する方が合理的 |
| **M5 期間** | 1週間（バックエンド認証 + 素のHTMLフォーム） | UI を縮小したことで当初1週間枠に回帰 |
| **ロール管理** | BLRA 側 DB で管理（Keycloak のロールマッパー不使用） | §12.3 の5ロールを BLRA のテーブルで持つ。アプリ層 + RLS の二重担保 |
| **ユーザ識別子** | Keycloak の `sub` claim | OIDC 標準。email は変更されうるが sub は不変 |
| **ユーザ登録** | JIT プロビジョニング（初回ログインで自動作成） | 招待フローなしの代替。デフォルト RESEARCHER ロール |

## 3. アーキテクチャ

### 3.1 全体構成

```
┌─────────────────────────────────────────────────────────┐
│  ブラウザ（React SPA, Vite dev :5173）                     │
│  ・TanStack Query で API 取得                             │
│  ・Cookie 付き fetch（BFF パターン）                       │
│  ・6状態 UI                                               │
└──────────────────────┬──────────────────────────────────┘
                       │ httpOnly Cookie（セッション）
┌──────────────────────▼──────────────────────────────────┐
│  Fastify（API + BFF）:3000                                │
│  ├─ onRequest: セッション検証 → request.session.user      │
│  ├─ /auth/login, /auth/callback, /auth/logout            │
│  ├─ /me                                                  │
│  ├─ /sources, /provisions/:id  （参照系・認証任意）        │
│  └─ /admin/*       （要認証 + ロールチェック）             │
└──────┬─────────────────────┬────────────────────────────┘
       │                     │
┌──────▼──────┐   ┌──────────▼──────────┐
│ PostgreSQL  │   │ Keycloak (:8080)     │
│ :5433       │   │ レルム: blra          │
└─────────────┘   └──────────────────────┘
```

### 3.2 責務分離

1. **Fastify が BFF 兼 API を兼ねる**。React は Vite proxy 経由で同一オリジンアクセス。CORS 不要
2. **OIDC の複雑さ（PKCE・state・nonce）は `openid-client` に任せる**。Fastify 側は薄いラッパー
3. **認可（RBAC）は `preHandler` フック**。`request.session.user.roles` を見てガード
4. **ロール管理を BLRA DB で持つ**。Keycloak は認証（你是誰）のみ。認可（何ができる）は BLRA 側

## 4. データモデル

### 4.1 新規テーブル（マイグレーション 0007_identity.ts）

```sql
-- ロール enum（§12.3 の5ロール）
CREATE TYPE role_enum AS ENUM (
  'ORGANIZATION_ADMIN', 'RESEARCHER', 'REVIEWER', 'CORPUS_EDITOR', 'SYSTEM_ADMIN'
);

-- 組織
CREATE TABLE organization (
  organization_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ユーザ（Keycloak アカウントと1:1）
CREATE TABLE app_user (
  user_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keycloak_sub     TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 組織メンバーシップ（ユーザ × 組織 × ロール）
CREATE TABLE organization_member (
  organization_id  UUID NOT NULL REFERENCES organization(organization_id),
  user_id          UUID NOT NULL REFERENCES app_user(user_id),
  role             role_enum NOT NULL,
  granted_by       UUID REFERENCES app_user(user_id),
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, role)
);
```

### 4.2 設計判断の根拠

- **`keycloak_sub UNIQUE`**: OIDC subject は不変。同一ユーザの重複作成防止
- **3組複合主キー** `(organization_id, user_id, role)`: 1ユーザ複数ロール所持可
- **`SYSTEM_ADMIN` の扱い**: NULL 許可せず、システム組織（seed）を1件作成。RLS ポリシーを等値比較に保つため
- **`audit_record` へのFK制約なし**: 監査ログは追記専用。ユーザ削除後も参照整合性を維持

### 4.3 シードデータ

```sql
INSERT INTO organization (organization_id, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'ACTIVE');
```

### 4.4 既存テーブルへの影響

- `audit_record.actor_id` / `organization_id`（既存・NULL許容）→ M5 から値を格納。FK制約は付けない
- コーパス系テーブル（source 等）は `organization_id` を持たない。M5 では変更なし

## 5. 認証・認可フロー

### 5.1 OIDC 認証フロー（認可コード + PKCE）

1. 未認証リクエスト → `/auth/login` へリダイレクト
2. Fastify が PKCE verifier, state, nonce を生成しセッションに保存
3. Keycloak 認可エンドポイントへリダイレクト
4. ユーザログイン後、認可コード + state で `/auth/callback` へコールバック
5. `openid-client` の `authorizationCodeGrant()` でトークン交換
6. ID トークン検証（JWKS）、nonce 検証、sub/email 取得
7. JIT: `app_user` に同一 `keycloak_sub` が無ければ INSERT
8. セッションに userId, organizationId, roles, keycloakSub を格納
9. 元のURL or `/admin` へリダイレクト

### 5.2 セッション格納内容

```typescript
interface SessionData {
  userId: string;
  organizationId: string;
  roles: RoleEnum[];
  keycloakSub: string;
  createdAt: number;
}
```

有効期限: Cookie `maxAge` = 8時間（業務利用1日想定）。

### 5.3 認可マトリクス

| エンドポイント | 要認証 | 必要ロール | 根拠 |
|---|---|---|---|
| `GET /sources`, `/sources/:id`, `/provisions/:id` | 不要 | — | §5.3 公開済みは参照可能 |
| `GET /admin/audit` | 要 | `SYSTEM_ADMIN` | 監査ログはシステム運用者のみ |
| `POST /admin/ingest` | 要 | `CORPUS_EDITOR` | 取込はコーパス編集者 |
| `POST /admin/source-versions/:id/publish` | 要 | `CORPUS_EDITOR` | §5.4 Publish は Corpus Editor |
| `GET /me` | 要 | （ロール不問） | 自身の情報 |
| `GET /admin/ingestion-jobs` | 要 | `CORPUS_EDITOR` | SCR-10 |
| `GET /admin/source-versions/:id` | 要 | `CORPUS_EDITOR` | SCR-12 詳細 |
| `/admin/organizations/:id/members` | 要 | `ORGANIZATION_ADMIN`（自組織のみ） | SCR-20 |

### 5.4 audit-repo 拡張

`InsertAuditRecordParams` に `actorId`, `organizationId` を追加。`admin.ts` 各ハンドラは `request.session.user` から取得して渡す。

## 6. RLS 基盤

M5 では基盤のみ。`organization` テーブルでポリシー雛形を実装し、アプリ側から PostgreSQL セッション変数を設定する結線を行う。

```sql
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON organization
  FOR ALL
  USING (organization_id = current_setting('app.current_org', true)::uuid);
```

```typescript
// 認証済みリクエストごとに SET LOCAL でセッション変数を設定
await sql`SET LOCAL app.current_org = ${user.organizationId}`.execute(db);
```

コーパス系テーブル・project/evidence 系テーブルの RLS は対象外。

## 7. Admin UI（素のHTMLフォーム）

### 7.1 構成

Fastify から `@fastify/static` で静的HTMLファイルを配信。React/Vite/TanStack は導入しない（次フェーズの法令リーダー実装時に導入）。

各画面は最小限のHTMLフォーム:
- **SCR-00 ログイン**: `/auth/login` へのリダイレクトボタンのみ
- **SCR-10 取込ダッシュボード**: lawId 入力フォーム + `POST /admin/ingest` ボタン
- **SCR-12 SourceVersion 詳細/Publish**: メタデータ表示 + Publish ボタン（§5.4 の `can_publish` で無効制御）
- **SCR-20 組織・メンバー管理**: メンバー一覧 + 追加フォーム

### 7.2 6状態設計（§19.14）の扱い

M5 では実装しない。エラー時はHTTPステータスコードに応じたシンプルなメッセージ表示のみ。6状態フル実装は法令リーダーと共に次フェーズで導入するReact基盤上で行う。

## 8. テスト戦略

### 8.1 バックエンド（Vitest）

- OIDC は `openid-client` Client をモック化（Keycloak コンテナを使わない）
- `tests/auth/`: 認証フロー、セッション、RBAC（約30件）
- `tests/routes/`: `/me`, members エンドポイント、admin 拡張（約20件）
- JIT プロビジョニング: 固定 sub/email で2回ログイン → 重複作成されないことを検証

### 8.2 フロントエンド

素のHTMLフォームのため、フロントエンド単体テストは実施しない。
APIエンドポイントの E2E 的な動作確認（curl または Vitest の inject）で代替する。

## 9. ディレクトリ構成（M5 完了時）

```
src/
  auth/                  ← M5 新規
    oidc-client.ts       openid-client 初期化
    session.ts           @fastify/secure-session 設定
    routes.ts            /auth/login, /auth/callback, /auth/logout
    require-roles.ts     preHandler ロールチェック
    provision.ts         JIT プロビジョニング
    types.ts             SessionData, RoleEnum
  routes/
    me.ts                ← /me エンドポイント
    members.ts           ← SCR-20 エンドポイント
    admin.ts（拡張）
    corpus.ts（既存）
  db/repos/
    user-repo.ts         ← app_user CRUD
    member-repo.ts       ← organization_member CRUD
    audit-repo.ts（拡張）
  ui/                    ← M5 新規（素のHTML）
    public/              ← @fastify/static で配信
      admin.html         SCR-10/12/20 のフォーム
      login.html         SCR-00
tests/
  auth/                  ← M5 新規
```

## 10. 新規依存パッケージ

**バックエンド:** `openid-client`, `@fastify/secure-session`, `@fastify/static`

**フロントエンド:** なし（素のHTMLフォーム。React/Vite/TanStack は次フェーズ）
