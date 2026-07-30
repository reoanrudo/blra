# ADR-027 — 日本語検索基盤に pg_bigm を採用する

- 日付: 2026-07-30
- ステータス: ACCEPTED
- 対応する未解決事項: 設計書 §16 の O-2（日本語検索基盤）

## 決定

**PostgreSQL の pg_bigm 拡張を日本語全文検索基盤として採用する。** OpenSearch・PGroonga は導入しない。

## 背景

設計書 §9.2 は日本語トークナイズを PostgreSQL 拡張（pg_bigm / PGroonga）または OpenSearch + Sudachi に置く方針である。アプリケーション層に形態素解析器を組み込まない（ADR-022）。

O-2 は「Phase 0 (F-7)」で決定する未解決事項であった。S1 着手時に確定させる要件（README・ADR-022）。

## 根拠

### F-7 の実測結果（2026-07-29）

[F-7-search-infra.md](../../s0-findings/F-7-search-infra.md) で以下を確認した。

| 拡張 | 版 | 用途 | 結果 |
|---|---|---|---|
| `btree_gist` | 1.7 | EXCLUDE 制約での uuid 等値比較（ADR-013） | **利用可** |
| `pg_bigm` | 1.2 | 日本語 N-gram（2-gram）全文検索（§9.2） | **利用可** |
| `pg_trgm` | 1.6 | 3-gram。日本語には不利（検索漏れ） | 利用可だが不採用 |
| `pgroonga` | — | 形態素＋N-gram | **利用不可**（Homebrew PG16 に非収録） |

### pg_bigm を選ぶ理由

1. **PostgreSQL 内蔵で運用が単純。** OpenSearch のような独立クラスタを保守しない。Solo Track（1名＋AI）において、検索基盤の運用コストを最小化する（ADR-016）
2. **2-gram により日本語の検索漏れを防ぐ。** pg_trgm の 3-gram は 1〜2 文字のクエリで検索漏れを生む。法令検索では条番号・専門用語の部分一致が頻発する
3. **Search Index は再構築可能な Projection である（ADR-003）。** pg_bigm のインデックスが破損しても、ProvisionVersion から再構築できる。System of Record を汚さない

### OpenSearch を採らない理由

- 独立クラスタの運用コストが Solo Track に合わない
- 形態素解析（Sudachi）の利点は、設計書 §9.2 がアプリ層に形態素解析器を置かない方針により薄まる
- pg_bigm で Recall・精度の要件を満たせる（F-7 で確認）

### PGroonga を採らない理由

- Homebrew の PostgreSQL 16 に収録されていない（F-7 で実測）
- Docker 環境でもパッケージ提供がないため、ソースビルドが必要で運用負荷が高い
- pg_bigm で要件を満たせるため、導入リスクに見合わない

## 影響

- **インデックス設計**: `provision_version.body_normalized` へ `CREATE INDEX ... USING gin (body_normalized gin_bigm_ops)` を作成する。これは S2 で実装する
- **Docker 構成**: pg_bigm を `shared_preload_libraries` へ登録する（S1 M1 の Dockerfile.postgres で対応済み。ソースビルドにより組み込む）
- **CI**: CI 環境でも pg_bigm 付き PostgreSQL イメージを使用する

## 関連

- 設計書 §9.2（日本語トークナイズ）
- 設計書 §9.4（インデックス単位とフィールド）— S2 で実装
- [F-7-search-infra.md](../../s0-findings/F-7-search-infra.md) — 実測結果
- ADR-003（Search Index は再構築可能な Projection）
- ADR-022（TypeScript / Node 22。アプリ層に形態素解析器を置かない）
