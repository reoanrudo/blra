# BLRA — 建築法令リファレンス

建築実務者が、適用時点と出典の確からしさを明示したまま法令原文をたどり、案件単位で根拠を保存し、第三者が再現できる形で共有するためのサービス。

- 設計正本: [docs/design-spec.md](docs/design-spec.md)（**v1.2**・Normative）
- 引き継ぎ: [docs/HANDOFF.md](docs/HANDOFF.md)
- 調査記録: [docs/research-log.md](docs/research-log.md)（Informative。設計根拠）
- 体制: Solo Track（実装1名＋AI支援）。設計書 §15.8

---

## 現在地: S1 M4 完了・M5 着手

**S1（Corpus Foundation）の M1〜M4 が完了。** 建築基準法1本を e-Gov API → 取込 → 構造化 → Publish → HTTP API 経由で参照・操作できる（S1 Exit 条件をほぼ達成）。次は M5（認証基盤 OIDC + Admin画面最小限）。

S0（Corpus Feasibility）は完了済み（[ADR-024](docs/adr/ADR-024-s0-exit.md)）。

| マイルストーン | 内容 | 期間 | 状態 |
|---|---|---|---|
| M1 | プロジェクト基盤 + 初期DB + Kysely検証 | 1.0週 | **完了** |
| M2 | e-Gov Parser + 条項分割 + canonical_path生成 | 1.5週 | **完了** |
| M3 | 取込パイプライン（Fetcher→Raw保存→Parser→Validation→Publish） | 1.0週 | **完了** |
| M4 | Publish API + Source Registry API + 監査 | 0.5週 | **完了** |
| M5 | 認証基盤（OIDC）+ Admin画面（最小限） | 1.0週 | **次** |
| M6 | E2Eテスト + SourceVersion不変性テスト + ドキュメント | 1.0週 | 未着手 |

**M4 実績（2026-07-30）**: HTTP API 7エンドポイント完成。curl/ブラウザから法令データの参照・取込トリガー・Publish・監査ログ検索が可能。テスト104件全合格。

対象テーマは確定済み（[ADR-026](docs/adr/ADR-026-target-domain.md)）: **就寝用途のある福祉施設（老人ホーム等）の、新築における防火・避難**。

S1 と並行して進める項目（いずれも S1 を止めない）:

- [ ] U-1（実務者ヒアリング）。案B の価値提案が成立するかを検証する → [user-research/](user-research/README.md)
- [ ] ゲート検査者の確保（8〜16時間・任意）→ [docs/domain-reviewer-role.md](docs/domain-reviewer-role.md)

## 開発環境

```bash
docker compose up -d      # PostgreSQL 起動（ポート5433。初回は pg_bigm ビルドで数分）
cp .env.example .env      # .env 準備
npm run migrate           # マイグレーション
npm test                  # テスト（74件・Vitest）
npm run typecheck         # 型チェック
npm run dev               # サーバー起動（ポート3000）
npm run ingest            # 建築基準法の取込（M3 パイプライン）
```

**注意**: Homebrew の PostgreSQL がポート 5432 を占有しているため、Docker 側は 5433 を使用。

## 技術スタック（確定済み: ADR-022 + ADR-027 + ADR-030）

- **言語**: TypeScript / Node 22（ADR-022・ADR-030 で変更しないと明記）
- **HTTP**: Fastify
- **DB**: PostgreSQL 16（Docker Compose）
- **DBアクセス**: pg + Kysely（ORM不使用。型安全なSQLビルダ。EXCLUDE制約との組み合わせは M1 で実証済み）
- **マイグレーション**: node-pg-migrate（生SQL。EXCLUDE制約・CHECK・enum を直接記述）
- **検索**: pg_bigm（ADR-027。OpenSearch・PGroonga は不採用）
- **テスト**: Vitest
- **フロント**: React + Vite + TanStack（M5以降）

## ディレクトリ

```
src/                  本実装（M1〜）
  config.ts             環境変数読込
  server.ts             Fastify エントリ（/health, /ready）
  db/                   connection, types, repos/
  parser/               e-Gov Parser（M2）
  ingest/               取込パイプライン（M3）
  cli/                  ingest.ts（npm run ingest）
migrations/           node-pg-migrate（生SQL）
tests/                Vitest（74件）
docs/                 設計正本・ADR・HANDOFF
s0-findings/          S0 調査系成果物（F-1, F-4, F-7, F-8, F-9）
spikes/               S0 コード系検証（使い捨て前提・本実装へ持ち込まない）
reference/hourei-rag/ 稼働中MVPのコードスナップショット（実装技法の参考）
data/raw/             取込原本XML（.gitignore）
```

## 最重要原則（設計書 §18）

> 本サービスは、法令を自動判定することで信頼を得るのではない。法令原文、適用時点、出典の確からしさ、参照関係、調査根拠を正確に扱うことで信頼を獲得する。

誤った条文を自信を持って表示した瞬間に、このプロダクトの存在価値は失われる。

---

## S0 Corpus Feasibility（完了）

S0 は [ADR-024](docs/adr/ADR-024-s0-exit.md) で完了。F-1〜F-9 全項目 PASS、中止条件に非該当。詳細は各 ADR と `s0-findings/` を参照。

主要な結論:

- **国法令**: e-Gov API v2 から溶け込み済み現行全文が取得可能。構造化 99.97%、版管理・差分・Anchor 移行も実測で成立
- **告示**: テキストPDF で取得可能（OCR 不要）。ただし公式の溶け込み済み現行全文は存在しない。案文＋改正履歴の提示に留める（案B・[ADR-023](docs/adr/ADR-023-notification-consolidation-policy.md)）
- **利用条件**: e-Gov・国交省は PDL1.0（CC BY 4.0 互換）で自由利用。自治体例規は自治体ごとに異なる（[F-8](s0-findings/F-8-legal-terms.md)）
- **検索基盤**: pg_bigm で日本語全文検索が成立（[F-7](s0-findings/F-7-search-infra.md)・ADR-027 で確定）
