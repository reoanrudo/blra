# 引き継ぎプロンプト（2026-07-29 時点）

以下をそのまま新しいセッションに貼る。

---

BLRA（建築法令リファレンス）プロジェクトを引き継いでほしい。作業ディレクトリは `/Users/taguchireo/Downloads/blra` です。

## 最初に読むもの（この順で）

1. `README.md` — 現在地と S0 の進捗表
2. `docs/design-spec.md` — 設計の正本（v1.1、Normative）。これと矛盾する実装をしない
3. `s0-findings/` の各ファイル — F-1〜F-9 の実測結果。**推測ではなく実測値が入っている**
4. `git log --oneline` — 各コミットメッセージに発見が要約してある

`docs/research-log.md`（1.1MB）は調査記録であり Informative。設計根拠を辿るとき以外は読まなくてよい。

## 現在地

S0（Corpus Feasibility、3週間の想定）の途中。**まだアプリケーション本体を作っていないし、作ってはいけない。**

| 項目 | 状態 |
|---|---|
| F-1 Source Inventory | 国法令は確定 / 告示は調査中 |
| F-2 e-Gov Parser | PASS（抽出率 99.97〜100.00%） |
| F-3 告示 Parser | 見通し良好・本検証未実施 |
| F-4 溶け込み実現性 | **完了・案B 採用（ADR-023）** |
| F-5 Version Diff | PASS |
| F-6 Citation Resolver | PASS（99.6%） |
| F-7 検索基盤 | PASS（pg_bigm 採用） |
| F-8 利用条件の法的確認 | **未着手** |
| F-9 履歴の遡及範囲 | 完了・要判断 |

## ✅ 解決済み: O-1（告示の扱い）

**2026-07-29 付で案B に決定した（[ADR-023](adr/ADR-023-notification-consolidation-policy.md)）。** 告示の溶け込み現行全文は提供せず、案文（`OFFICIAL_AS_ENACTED`）＋改正履歴の提示に留める。README および設計書の O-1 記載は更新済み。

**残るリスク**: U-1（実務者ヒアリング）で「告示の現行全文が読めないツールに価値があるか」を必ず確認すること。芳しくなければ案A 限定適用または案C への再考を ADR 改訂として起す。

## 決まっていること（蒸し返さない）

- 体制は Solo Track（実装1名＋AI）。ただし**建築法令 Domain Reviewer の外部確保が S1 の必須条件**（ADR-016）。兼任不可
- 実装言語は TypeScript / Node 22（ADR-022）
- 検索基盤は pg_bigm。OpenSearch は入れない（F-7 で実測）
- `spikes/` は使い捨て。本実装へそのまま持ち込まない

## ✅ 解決済み: 設計書修正5件

**2026-07-29 付で設計書へ反映済み。** F-2 / F-5 / F-6 の実測値に基づき、§6.1（附則の canonical_path 衝突対策・別表タイトル生成）、§6.3（CitationRef の alternatePaths・略称の法令種別依存）、§9.3（ルビ除外）、§13.1（provision テーブル制約）を修正した。

## やってはいけないこと

- **S1（アプリ本体の実装）へ進まない。** S0 Exit と Domain Reviewer 確保が条件
- 誤った条文を自信を持って表示する実装をしない。時点解決が曖昧なら推測せずエラーにする（設計書 §4.2、§18）
- Rule DSL / Compiler / Graph DB / Vector DB / Event Broker に手を出さない（ADR-006、ADR-015）
- 設計書の「削らない4つ」（法令時間モデル / Consolidation State / Citation Anchor / Snapshot 不変性）を工数都合で削らない（ADR-017）

## 環境

- Node 22、PostgreSQL 16（Homebrew、起動済み）、Docker、Python 3.13
- 検証用 DB `blra_f7` が作成済み（`psql -d blra_f7`）
- spike の実行: `cd spikes && npm install` のあと `npm run f2` / `f5` / `f6` / `f7:export`
- e-Gov API v2 は認証不要。`https://laws.e-gov.go.jp/api/2/`（v1 は 301 を返すので使わない）

## 次にやること

1. ~~O-1 の回答を受けて ADR に記録する~~ **→ 完了（ADR-023）**
2. ~~F-8（e-Gov データ・告示 PDF・自治体例規の再配布/加工条件）を調べる~~ **→ 完了（一次情報で確認）**
3. F-3 の本検証（対象テーマの告示 50 件で「45件以上から出典・文書番号・公布日を取得」）
4. S0 Exit 判定 → ADR 記録
5. ~~上記の設計書修正5件を反映~~ **→ 完了**

U-1〜U-4（実務者ヒアリング、Baseline計測、検索課題30件、Design Partner確保）は Taguchi さん側の作業として並行。**特に「告示の現行全文が読めないツールに価値があるか」は U-1 で必ず確認する必要がある。**
