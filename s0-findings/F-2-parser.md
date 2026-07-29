# F-2: e-Gov Parser Spike — 結果

- 実施日: 2026-07-29
- 合格条件（設計書 §15.2）: 法令標準XML から条・項・号の抽出率 99% 以上
- 判定: **PASS（3/3）**
- 再現: `cd spikes && npm run f2`

## 結果

| 法令 | 版（施行日） | 条項数 | 抽出率 | Validation |
|---|---|---|---|---|
| 建築基準法 | 2027-05-26 | 2,264 | **100.00%** | エラーなし |
| 建築基準法施行令 | 2025-12-01 | 2,552 | **99.99%** | エラーなし |
| 建築基準法施行規則 | 2026-04-01 | 1,789 | **99.97%** | エラーなし |

内訳（建築基準法）: ARTICLE 292 / PARAGRAPH 1,198 / ITEM 586 / SUPPLEMENTARY 184 / TABLE 4

残差はいずれも `EnactStatement`（制定文）である。「内閣は、建築基準法の規定に基き、この政令を制定する」という文であり、条項ではないため Provision に含めないのが正しい。実質の取りこぼしはゼロである。

### 抽出率の定義

分子・分母ともに空白を除いた文字数で数える。

- 分母: LawBody 配下の「本文になりうるテキスト」。目次（TOC）、構造見出し（ChapterTitle 等）、条項番号（ArticleTitle、ParagraphNum、ItemTitle）、附則ラベル、ルビの読み仮名（Rt）を除く。これらはナビゲーション情報または `stable_label` / `heading` へ入る情報であり、本文ではない
- 分子: 生成した Provision の `heading + body` の合計

## 確認できたAPI仕様（実測）

e-Gov 法令API v2。v1（`elaws.e-gov.go.jp/api/1/`）は 301 を返すため使用しない。

```
GET https://laws.e-gov.go.jp/api/2/laws?law_title={title}&limit={n}
GET https://laws.e-gov.go.jp/api/2/law_revisions/{law_id}
GET https://laws.e-gov.go.jp/api/2/law_data/{law_revision_id}[?response_format=xml]
```

- 収録法令数: 9,536 件
- 対象法令ID: 建築基準法 `325AC0000000201` / 施行令 `325CO0000000338` / 施行規則 `325M50004000040`
- `law_revision_id` の形式: `{law_id}_{施行日YYYYMMDD}_{改正法令ID}`
- 本文は JSON（tag / attr / children の汎用ツリー）と XML の両方で取得可能。JSON は法令標準XMLをそのまま写した構造であり、パースはどちらでも同等
- 建築基準法の本文は約 1.29 MB

`revision_info` に含まれる時点関連の項目:

| 項目 | 設計書との対応 |
|---|---|
| `amendment_enforcement_date` | §4.2 `valid_from`（施行日） |
| `amendment_scheduled_enforcement_date` | §4.2 `valid_from_status = UNDETERMINED` の判定材料 |
| `amendment_promulgate_date` | §4.2 `promulgated_at`（公布日） |
| `repeal_date` / `repeal_status` | 失効の判定 |
| `current_revision_status` | 現行版の判定 |

設計書 §4.2 の時点モデルは、この API の提供項目でそのまま満たせる。

---

## 設計書への反映が必要な発見（3件）

### 発見1: canonical_path が附則で衝突する（要・設計書修正）

**建築基準法には SupplProvision が 120 個ある。** 改正法ごとに 1 つ置かれ、それぞれが第1条・第1項を持つ。

設計書 §6.1 の `canonical_path`（`art52-2/para1/item3`）と §13.1 の `UNIQUE (source_id, canonical_path)` では、これらがすべて `art1/para1` に衝突する。初回実行時に重複が 100 件以上検出された。

**採った回避策（spike）**: `SupplProvision` の属性 `AmendLawNum`（改正法令番号）で名前空間を切る。

```
suppl:昭和二六年六月四日法律第一九五号/art1/para1
```

制定時の附則には `AmendLawNum` がないため `suppl:original` とする。

**本実装での課題**: 上記は漢数字の法令番号をそのままパスに含むため、URL に載せると可読性と安定性の両面で不利である。改正法令番号を改正法の `law_id` へ解決してから `suppl:508AC0000000023/art1/para1` の形にすることを推奨する。ただし `law_revisions` の `amendment_law_id` と `SupplProvision/@AmendLawNum` の突合が全件で可能かは未検証である。

→ **設計書 §6.1 と §13.1 の修正が必要。S1 のスキーマ確定前に決める。**

### 発見2: 条文の本文は ParagraphSentence の外にもある

`Sentence` の親タグ分布（建築基準法）:

| 親タグ | 件数 |
|---|---|
| ParagraphSentence | 1,412 |
| ItemSentence | 419 |
| **TableColumn** | **368** |
| **Column** | **254** |
| Subitem1Sentence | 43 |

`ParagraphSentence` だけを本文として拾うと、条文内の表（`TableStruct`）と欄（`Column`）を丸ごと落とす。**建築基準法では本文の約 2% がこれに該当する。**

対応: 条項ノードの直下から「子の条項（Item 等）と見出しを除いた残り全部」を本文とする方式に変更した。

設計書 §8.4 の「表・図・算式を含む文書は、欠落したまま表示しない」を満たすには、この方式が前提になる。

### 発見3: ルビの読み仮名が本文へ混入する

`Ruby` 要素の子 `Rt`（読み仮名）を素朴に連結すると、本文が「建築物けんちくぶつ」のようになる。建築基準法施行規則で 28 箇所。

これは表示だけでなく、検索索引（設計書 §9.4 の `body_normalized`）と AI の Citation Validator（§11.5 の「表示抜粋が Source 本文と文字列一致する」）を同時に壊す。

対応: `Rt` / `Rp` を本文から除外した。

→ **本実装のテキスト正規化（§9.3）に「ルビの読み仮名を本文へ含めない」を明記すべき。**

---

## 構造上の注意（実装メモ）

- `Item` の子は `Subitem1`、`Subitem1` の子は `Subitem2` である。階層の深さとタグ番号が 1 ずれる。素直に `depth` を使うと号の下の階層を丸ごと落とす（初回実行で 47 箇所を落とした）
- `ArticleCaption`（条見出し）は `heading` へ、`ArticleTitle`（「第一条」）は `stable_label` へ入れる。両方を本文に入れない
- 附属様式は `AppdxStyle` として多数存在する（施行規則で 226 件）。`{tag}Title` を heading と body の両方へ入れると二重計上になる

## 未検証

- 告示（HTML / PDF）のパース → F-3
- 自治体例規のパース → S0 では対象外（設計書 §15.8.3 により手動登録）
- 差分抽出 → F-5
