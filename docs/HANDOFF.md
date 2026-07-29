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
| F-4 溶け込み実現性 | **要判断（下記 O-1）** |
| F-5 Version Diff | PASS |
| F-6 Citation Resolver | PASS（99.6%） |
| F-7 検索基盤 | PASS（pg_bigm 採用） |
| F-8 利用条件の法的確認 | **未着手** |
| F-9 履歴の遡及範囲 | 完了・要判断 |

## 最優先: ユーザーの判断待ち（O-1）

**告示の扱いを案A / B / C のどれにするか、Taguchi さんの回答を待っている状態。** 回答を得るまで F-8 以降へ進まない。

判断の背景は `s0-findings/F-3-F-4-notifications.md` に全部書いてある。要点だけ再掲する。

- 告示は e-Gov に収録されていない（実測で確認）
- 国交省サイトの告示は全て PDF だが**テキスト PDF で OCR 不要**（良い知らせ）
- ただし掲載は**案文（制定時本文）と新旧対照表のみ。溶け込み済み現行全文は公式に存在しない**
- 1つの改正告示が 34 件以上の既存告示を改正する実例がある。自製統合は S0 中止条件（1件2時間）を超える見込み

案A（自製の現行版を提供）/ 案B（原文＋改正履歴の提示に留める）/ 案C（テーマ変更）。**前セッションの推奨は案B。**

回答を得たら ADR として記録し、README の S0 Exit Criteria を更新すること。

## 決まっていること（蒸し返さない）

- 体制は Solo Track（実装1名＋AI）。ただし**建築法令 Domain Reviewer の外部確保が S1 の必須条件**（ADR-016）。兼任不可
- 実装言語は TypeScript / Node 22（ADR-022）
- 検索基盤は pg_bigm。OpenSearch は入れない（F-7 で実測）
- `spikes/` は使い捨て。本実装へそのまま持ち込まない

## 設計書へ反映が必要な発見が5件たまっている

S1 のスキーマ確定前に `docs/design-spec.md` を修正すること。いずれも実測に基づく。

1. **§6.1 / §13.1**: canonical_path が附則で衝突する。建築基準法には SupplProvision が 120 個あり、それぞれ第1条を持つ（F-2）
2. **§6.1**: 別表・様式の canonical_path を出現順の連番で振ると版間で追跡できない。タイトルから生成する方式へ（F-5）
3. **§6.3**: `CitationRef` に `alternatePaths` を追加。「第二条第九号」の実パスは `art2/para1/item9` で、この補完がないと解決率が 71% に落ちる（F-6）
4. **§6.3**: 略称「法」「令」の解決先は読んでいる法令の**種別**に依存する。施行令の「法第二条」は建築基準法（F-6）
5. **§9.3**: ルビの読み仮名（`Rt`）を本文に含めない。含めると「建築物けんちくぶつ」となり検索索引と Citation Validator が同時に壊れる（F-2）

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

1. O-1 の回答を受けて ADR に記録する
2. F-8（e-Gov データ・告示 PDF・自治体例規の再配布/加工条件）を調べる。Web 調査は `search-research` スキルに従う（PRIMARY: dokobot）
3. F-3 の本検証（対象テーマの告示 50 件で「45件以上から出典・文書番号・公布日を取得」）
4. S0 Exit 判定 → ADR 記録
5. 上記の設計書修正5件を反映

U-1〜U-4（実務者ヒアリング、Baseline計測、検索課題30件、Design Partner確保）は Taguchi さん側の作業として並行。**特に「告示の現行全文が読めないツールに価値があるか」は U-1 で必ず確認する必要がある。**
