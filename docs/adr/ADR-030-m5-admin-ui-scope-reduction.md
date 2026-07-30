# ADR-030 — M5 Admin UI を素のHTMLフォームに縮小し、フロントエンド基盤導入を法令リーダーへ延期する

- 日付: 2026-07-30
- ステータス: ACCEPTED
- 対応する未解決事項: M5 ブレインストーミング「Admin UI の作り込み度」および「フロントエンド基盤の導入タイミング」

## 決定

**M5 の Admin UI を React + Vite + TanStack + 6状態フル実装から、素のHTMLフォーム（`@fastify/static` 配信）へ縮小する。** フロントエンド基盤（React/Vite/TanStack）の導入は、次フェーズの法令リーダー（SCR-03）実装時に行う。

M5 の期間は2週間（Week2=Admin UI）から1週間（バックエンド認証 + 素のHTMLフォーム）へ回帰した。

## 背景

M5 のブレインストーミング（2026-07-30）で、当初「6状態フル実装」を選択し、期間を2週間に延長することを決定した。その後、以下の理由でスコープ縮小を決定した。

### 縮小の理由

1. **Admin 画面は Corpus Editor / System Admin 専用（§19.13）で、Solo Track（§15.8）では利用者が1人しかいない。** 6状態フル実装の投対効果が低い
2. **設計書 ADR-017 / §15.8.2 は Solo Track で UI を削減対象としている。** 法令リーダー（利用者画面）に比べ、Admin 画面の作り込み優先度は低い
3. **S1 Exit 条件（建築基準法1本の E2E 公開）は M3 で達成済み。** Admin UI の完成度は S1 Exit に影響しない
4. **フロントエンド基盤の導入タイミングが問題。** 法令リーダーは明朝体・紙面レイアウト・CSS Custom Highlight API・DOM 予算（設計書 §19.22）という固有要件を持つ。Admin 画面の都合で基盤（コンポーネント設計・状態管理・スタイル戦略）を決めると、法令リーダー実装時に作り直しになる

### 代替手段

Admin 画面は素のHTMLフォーム（`public/login.html`, `public/admin.html`）で足りる。`@fastify/static` で配信し、`fetch` でAPIを呼ぶ。6状態は不要。認証・認可・監査が動いていることが確認できれば M5 完了とする。

## 根拠

### Admin 画面に React が不要な理由

- CRUD 操作（取込トリガー・Publish・メンバー管理）はフォーム送信で完結する
- リッチな状態管理（TanStack Query のキャッシュ・楽観更新等）は、利用者1人・操作頻度低の Admin 画面では過剰
- 6状態（§19.14）のうち「部分失敗」「権限不足」以外は、HTTPステータスコードに応じたメッセージ表示で足りる

### 法令リーダーで React を導入すべき理由

- **CSS Custom Highlight API（§19.22.3）のハイライト制御**に、React のコンポーネントライフサイクルとRef管理が必要
- **仮想化（§19.22.2）** — 可視範囲外の条文をDOMから外す制御に、TanStack Virtual または独自の IntersectionObserver 実装が必要
- **6状態（§19.14）の本格実装** — 特に「部分失敗でも本文は隠さない」は、React のコンポーネント分岐で表現するのが自然
- **適用時点バー・参照3状態・サポートペイン** 等、法令リーダー固有のUI要素は状態が多く、宣言的UIの利益が大きい

## 影響

### M5 完了時の構成

- バックエンド認証基盤: Keycloak + openid-client + @fastify/secure-session + RBAC + JIT — **全て実装済み**
- Admin UI: `public/login.html` + `public/admin.html` — **実装済み**
- React/Vite/TanStack: **未導入**（package.json に依存なし、`web/` ディレクトリ不在）

### 次フェーズ（法令リーダー）への影響

- フロントエンド基盤をゼロから導入する必要がある（M5 で基盤を作らなかった分、SCR-03 の初期コストが増える）
- ただし、法令リーダーの固有要件に最適化された基盤を設計できるため、長期的にはプラス
- Admin 画面の React 化は、法令リーダー基盤が安定した後に必要に応じて実施する

## 残課題: RLS テストの検証抜け（M5 監査にて指摘）

M5 監査（2026-07-30）で、**RLS ポリシーが有効な状態でのテストが存在しない**ことが指摘された。

### 現状

マイグレーション 0007 で `organization` テーブルに RLS を有効化し、ポリシー `org_isolation` を設定している:

```sql
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON organization
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
    OR organization_id IS NULL
  );
```

しかし、テストヘルパー `tests/helpers/db.ts` の `truncateAll()` は seed 投入時に `SET row_security = off` でバイパスしており、**テスト実行時は常に `app.current_org` が未設定**のため、ポリシーが実質検証されていない。

### 実害

現時点では**実害ゼロ**。理由:
- RLS 対象が `organization` テーブル1つ
- 本命の project / evidence 系テーブルは S3 以降に作成
- コーパス系テーブル（source, provision 等）はテナント非対象で RLS 不要

### 対応方針

設計書 T-03（テナント分離テスト）に相当するテストを、**S3 の RLS 本格導入時に必ず実装する**。その前に、数十行で書ける以下のテストを M6 で追加することを推奨:

1. `app.current_org` を設定した状態で、他組織の行が見えないことの確認
2. `app.current_org` を設定した状態で、自組織の行が見えることの確認

**「テストが通っている」ことを RLS の動作確認と誤解しないこと。** 現在の123件は RLS が効いている状態の挙動を一度も確かめていない。

## 関連

- 設計書 §19.13（Admin 画面は Corpus Editor / System Admin 専用）
- 設計書 §19.14（6状態設計の共通規約）
- 設計書 §19.22（レンダリング戦略と性能予算・法令リーダーの固有要件）
- 設計書 §15.8.2（Solo Track での UI 削減）
- ADR-017（設計書の「削らない4つ」を工数都合で削らない）
- M5 設計書: `docs/superpowers/specs/2026-07-30-s1-m5-auth-admin-design.md`
