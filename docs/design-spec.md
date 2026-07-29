# 建築法令リファレンス（BLRA）実装設計書 v1.1

- 作成日: 2026-07-29（v1.1 同日改訂）
- 位置付け: Normative（実装の正本）
- 上位文書: `building-law-web-research.md`（調査記録・Informative）
- 対象読者: 実装担当、法令コンテンツ運用担当、Pilot 参加組織の窓口

---

## 0. この文書について

### 0.1 目的

本書は、建築法令WEB化プロジェクトの調査記録（全58章＋設計レビュー＋MVPベースライン v1.0）を、実装可能な単一の設計書へ昇格させたものである。

調査記録は「何が分かったか」を時系列で積み上げた文書であり、同一責務が複数章で再定義され、Normative な仕様と将来構想が同じ階層に並んでいた。本書は、そこから実装に必要な決定だけを抽出し、決定していなかった箇所を決定し、調査記録が到達していた重要な知見のうち MVP ベースラインへ反映されていなかったものを差し戻したものである。

### 0.2 上位文書との関係

| 文書 | 種別 | 本書との関係 |
|---|---|---|
| `building-law-web-research.md` 第1〜50章 | Informative | 設計根拠。本書と矛盾する場合は本書が優先する |
| 同 第51〜57章（Compiler / VM / Registry 等） | Future | 本書のスコープ外。参照のみ |
| 同 Architecture Review 2026-07-29 | Superseded | 本書 §1 に統合済み |
| 同 成果物A・B・C（MVP Baseline v1.0） | Superseded | 本書が置き換える。差分は §1.3 |

本書に記載のない機能は MVP の要件ではない。追加には §15.6 の変更手続を要する。

### 0.3 文書ステータスの扱い

会話や検討で生成された内容は、自動的に Normative にならない。本書へ取り込まれた時点で Normative になる。

```text
DRAFT → REVIEWED → ACCEPTED → NORMATIVE → DEPRECATED
```

### 0.4 版履歴

| 版 | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026-07-29 | 初版（調査記録からの昇格） |
| v1.0.1 | 2026-07-29 | Solo Track 採用（§15.8〜15.10、ADR-016〜018） |
| v1.1 | 2026-07-29 | 総合レビュー指摘の反映（C-1〜C-3、H-1〜H-3、M-1〜M-5）、画面設計章（§19）追加 |

---

## 1. 設計判断の要約

### 1.1 プロダクトの定義

> 建築実務者が、限定された法令領域について、**適用時点と出典の確からしさを明示したまま**法令原文をたどり、案件単位で根拠を保存し、第三者が再現できる形で共有できるようにする。

適合判定は行わない。専門家判断・行政判断・確認処分を代替しない。

### 1.2 維持する中核原則

調査記録が到達した以下の分離は、本書でも中核として維持する。これらは一般的な法令検索サービスに対する本プロダクトの実質的な優位性であり、後から追加できない性質のものである。

- 法令原文（Source）と、そこから読み取れる規範（Norm）と、機械評価可能な形式（Rule）を分ける
- Evaluation 結果と専門家 Decision を分ける
- 法令の施行時点と、システムの記録時点を分ける
- 公開済みの Source Version と Evidence Snapshot を上書きしない
- Search / Graph / Vector は再構築可能な Projection とし、System of Record にしない
- AI を最終責任主体にしない

### 1.3 MVP Baseline v1.0 からの変更点

本書は既存ベースラインを土台とするが、次の 8 点を変更する。いずれも、調査記録の本文に根拠がありながら、レビュー時の単純化で失われていた論点である。

| # | 変更 | 理由 | 該当節 |
|---|---|---|---|
| 1 | 案件の適用時点を単一 `reference_date` から複数の日付アンカー（ApplicabilityContext）へ変更 | 建築実務の適用時点は確認申請日・着工日・既存建物の建築時点に紐づく。単一基準日では既存不適格・経過措置を扱う案件で使えない | §4.3 |
| 2 | `consolidation_state` を SourceVersion の必須属性として追加し、機械統合した「編集現行版」を Primary Citation にできない制約をコードで持つ | 告示は公式に溶け込み済み現行全文が存在しないものが多い。Authority Class だけでは制定本文・改正文・自製統合版を区別できない | §5 |
| 3 | Reference Edge の型を 40 種から 5 種へ削減 | 規範関係の型（IMPOSES_REQUIREMENT 等）は Norm 層の概念であり、MVP に Norm 層は存在しない。実装できない型を定義しない。版間の改正関係はエッジではなく版連鎖（§4.2）で表現する | §7.2 |
| 4 | Citation Resolver を独立コンポーネントとして正本化 | 検索・参照ナビ・AI 引用検証の 3 箇所が同じ引用解釈を必要とする。分散実装すると 3 者の挙動が食い違う | §6.3 |
| 5 | 「PostgreSQL FTS から開始してよい」を撤回し、日本語トークナイザの選定を Phase 0 の必須検証項目へ | PostgreSQL 標準の全文検索は日本語トークナイザを持たない。拡張（pg_bigm / PGroonga）の可用性はマネージドDBの選択に依存し、後から変えると Index 設計をやり直すことになる | §9.2 |
| 6 | North Star Metric を Evidence Set 数から「有効条文到達時間の短縮率」＋「Evidence Set 第三者再現成功率」へ変更 | 3組織10名規模の Pilot では Evidence Set は週数件しか生成されず、指標として分散が大きすぎる | §14.4 |
| 7 | Corpus Feasibility を User Research と並列ではなく先行させ、独立ゲートにする | 告示の現行全文が取得できない場合、プロダクト定義そのものが変わる（自製統合の人手運用を商品に含めるか否か）。これは設計判断ではなく事業判断であり、実装着手前に決める必要がある | §15.2 |
| 8 | 経過措置・既存不適格を「判定しない、ただし存在を検知して警告する」機能として明示 | 判定は専門家責任の領域だが、附則・経過措置の存在検知は決定論的に可能で、実務上の見落とし削減効果が最も大きい | §4.5 |

### 1.4 明示的に採用しない設計

以下は将来構想として否定しないが、本書のスコープに含めない。着手には独立した PRD とゲート通過を要する。

Rule DSL / Compiler / Virtual Machine / Package Registry / Policy Engine / Workflow Engine / Multi-Agent / BIM・IFC 連携 / GIS 空間評価 / Digital Twin / Marketplace / Federation / 標準化 / Graph DB / Vector DB / Event Broker / Microservice 分割 / 全国自治体網羅

---

## 2. スコープ

### 2.1 対象利用者

| 区分 | 役割 | Pilot での位置付け |
|---|---|---|
| Researcher | 意匠設計者、若手建築士。適用条文の探索と根拠保存 | 主対象 |
| Reviewer | 事務所の管理者・主任。根拠の確認と調査漏れの指摘 | 主対象 |
| Corpus Editor | 法令コンテンツの取込・公開責任者 | 自社運用 |
| Design Partner | 行政・指定確認検査機関の協力者 | 観察・指摘のみ。判断責任を負わせない |

### 2.2 対象コーパス

Phase 0 の Corpus Feasibility 結果により最終確定する。初期候補を次に限定する。

1. 建築基準法
2. 建築基準法施行令
3. 建築基準法施行規則
4. 対象テーマに直接関係する告示 30〜50 件（Solo Track では 15〜20 件。§15.8.3）
5. Design Partner となる 1 自治体の建築基準条例・施行細則・運用基準（Solo Track では手動登録）
6. 国土交通省の技術的助言・公式Q&A の限定セット

収録範囲の広さより、Version・Anchor・Authority の正確性を優先する。

### 2.3 対象テーマ

第一候補は **防火・避難**。第二候補は **用途変更**。

選定理由は、調査頻度が高く、法・令・告示・条例の 4 階層をまたぎ、かつ 2025年8月の防火・避難関係規制見直しという実在の改正事例を時点管理のテストケースに使えることによる。

MVP は「適合を自動判定する」のではなく「確認すべき根拠を漏れなくたどる」ことを目的とする。

### 2.4 Non-Goals

建築確認の自動承認 / 専門家 Decision の自動生成 / 全建築法令の完全収録 / 全国自治体条例 / BIM 自動審査 / 法律相談・行政解釈の代替 / 法令原文の無断改変。

---

## 3. ドメインモデル

### 3.1 中核概念の定義

実装時に最も混乱する 4 概念を先に固定する。

| 概念 | 定義 | MVP での扱い |
|---|---|---|
| **Source** | 公式機関から取得した法令文書または資料。1 つの URL/ファイルに対応する | 実装する |
| **Provision** | Source 内の条・項・号・別表・附則等の構造単位。時間を通じて同一性を保つ識別子を持つ | 実装する |
| **Norm** | Provision から読み取れる義務・禁止・許可・定義等の規範的意味 | **実装しない**（概念としてのみ保持） |
| **Rule** | Norm のうち、入力 Fact に対して機械評価できるよう形式化したもの | **実装しない**（§15.6 の並行トラックで実現可能性のみ検証） |

すべての Norm を Rule 化しない。特に次は Rule 化対象から恒久的に除外する。

- 総合判断を要する規定
- 「支障がない」「必要と認める」等の裁量概念
- 行政庁の個別判断を要する規定
- 図面・現地状況・専門鑑定なしに確定できない規定
- 複数法令・通達・判例・運用の統合を要する規定

### 3.2 Aggregate 一覧

MVP で実装する Aggregate はこれで全部である。

**法令コーパス側**

```text
Source              — 法令文書の同一性
SourceVersion       — 取得した特定時点の版（不変）
Provision           — 条項号の同一性
ProvisionVersion    — 特定時点の条項号本文（不変）
ReferenceEdge       — 条項間の関係
```

**利用者側**

```text
Organization        — テナント境界
Project             — 案件
ApplicabilityContext— 案件の適用時点アンカー群
ResearchQuestion    — 調査課題
SavedItem           — 案件へ保存した条項
Annotation          — 条文への注釈
EvidenceSet         — 調査根拠の集合（可変）
EvidenceSnapshot    — 発行済み根拠（不変）
ReviewRequest       — レビュー依頼
```

**運用側**

```text
IngestionJob        — 取込ジョブ
ReviewQueueItem     — 人手確認待ち
AuditRecord         — 監査記録（追記専用）
AiInteraction       — AI 呼出記録
```

### 3.3 データ所有規則

1. Legal Corpus モジュールのみが Source / SourceVersion / Provision / ProvisionVersion を更新できる。
2. Search Index は Projection である。削除・再構築可能でなければならない。System of Record にしない。
3. Project 側は ProvisionVersion を参照するのみ。本文を複製・改変しない。
4. EvidenceSnapshot は SourceVersionId と ProvisionVersionId を固定する。本文コピーは表示用キャッシュとしてのみ保持し、正本は参照先とする。
5. AI 出力を Provision 本文の正本として保存しない。
6. 監査ログは業務テーブルから独立し、追記専用とする。

---

## 4. 法令時間モデル

本節と §5、§6 が本設計の中核である。ここを誤ると後から直せない。

### 4.1 二系統の時間を分ける

| 系統 | 意味 | 保持先 |
|---|---|---|
| 法令時間（Valid Time） | いつからいつまで、その規定が法として有効か | `valid_from` / `valid_to` |
| 記録時間（Transaction Time） | いつ当システムがその情報を取得・記録したか | `retrieved_at` / `recorded_at` |

Bi-temporal を適用するのは次に限定する。全テーブルへ一律適用しない。

- SourceVersion
- ProvisionVersion
- （将来）Rule Version、Jurisdiction Assignment、Decision

Annotation や User Profile には通常の更新履歴で足りる。

### 4.2 法令側の時点属性

```text
promulgated_at       公布日
valid_from           施行日（この版が効力を持ち始める日）
valid_from_status    FIXED | UNDETERMINED | ESTIMATED
valid_to             失効日（次版の施行日。現行版は NULL）
retrieved_at         取得日時
recorded_at          登録日時
```

`valid_from_status` を持つ理由は、日本の法令に「政令で定める日から施行する」という未確定施行日が実在するためである。この状態を NULL や仮日付で表現すると、時点検索が静かに誤る。

**時点解決の規則**

基準日 D に対して有効な ProvisionVersion は次を満たすものとする。境界は半開区間 `[valid_from, valid_to)` とする。

```sql
valid_from <= D
AND (valid_to IS NULL OR D < valid_to)
AND valid_from_status = 'FIXED'
AND source_version.published_at IS NOT NULL  -- 公開済み版のみ（§8.2-4）
```

同一 Provision に対して該当版が 2 件以上返った場合、システムは自動で 1 件を選ばない。`DataIntegrityError` として運用アラートを上げ、UI には「時点解決に失敗しました」と表示する。**推測で 1 件を表示することを禁じる。** 誤った条文を自信を持って表示することが、このプロダクトで最も避けるべき失敗である。

未施行版（`valid_from > D`）は検索結果に含めず、条文表示画面で「未施行の改正があります」として別枠に表示する。

### 4.3 案件側の適用時点：ApplicabilityContext

**既存ベースラインからの変更点（§1.3-1）。**

建築実務における「いつの条文か」は、閲覧日でも単一の基準日でもない。次のイベント日に紐づく。

| アンカー種別 | 意味 | 典型的な用途 |
|---|---|---|
| `TODAY` | 閲覧時点 | 現行規定の確認 |
| `CONFIRMATION_APPLICATION` | 確認申請（予定）日 | 適用される規定の主たる基準 |
| `CONSTRUCTION_START` | 着工（予定）日 | 施行日をまたぐ案件の確認 |
| `EXISTING_BUILDING_ORIGIN` | 既存建物の建築時点 | 既存不適格の起点確認 |
| `CUSTOM` | 任意 | 過去案件の再検証 |

`EXISTING_BUILDING_ORIGIN` は、コーパスの時間的収録範囲（§4.6）より前の日付を指すことが多い。範囲外の日付が指定された場合の挙動は §4.6 に従い、近い版を推測で表示しない。

Project は複数のアンカーを持ち、閲覧中は常に 1 つが active である。

**UI 上の必須要件**

- 画面上部に active アンカーの種別と日付を常時表示する。日付を隠さない。
- アンカーを切り替えたとき、表示中の条文の内容が変わる場合は差分を提示する。黙って内容を差し替えない。
- Annotation・SavedItem は、作成時の active アンカーと ProvisionVersionId を記録する。後から別アンカーで開いたとき、「この注釈は 2026-04-01 時点の条文に付けられています」と表示する。

MVP では、どのアンカーを使うべきかをシステムは判断しない。判断は利用者が行い、システムは選択を記録・表示する。

### 4.4 改正差分

隣接する ProvisionVersion 間で、追加・削除・変更を条項単位で表示する。

差分は 2 種類あり、混同してはならない。

- **原文差分**: 公式の新旧対照表がある場合はそれを一次情報として表示する
- **正規化差分**: 当システムの正規化テキスト同士の機械差分。表示時に「機械比較」と明示する

正規化差分だけを根拠に「改正されていません」と表示しない。正規化処理の変更が差分に混入するためである。ParserVersion が異なる版同士の比較には警告を付す。

### 4.5 経過措置・既存不適格の扱い

**既存ベースラインからの変更点（§1.3-8）。**

判定はしない。ただし**存在の検知と導線の提示は行う**。これは決定論的に実装でき、実務上の見落とし削減効果が最も大きい機能である。

実装内容:

1. 改正法令の附則を Provision として取り込み、`provision_type = 'SUPPLEMENTARY'` を付す。
2. 附則本文中の条項参照を Reference Edge として抽出する（`EdgeType = CITES`）。
3. ある ProvisionVersion を表示する際、その Provision を参照する附則が存在すれば、条文の上部に注意帯を表示する。

```text
⚠ この条文には経過措置を定めた附則があります（○○法改正法 附則第3条）
   → 附則を開く / この案件の適用時点を確認する
```

4. 建築基準法第3条第2項（既存不適格）を参照する条文には、同様の導線を持たせる。

システムは「経過措置が適用されます」とは言わない。「経過措置を定めた規定が存在します」と言う。この差は責任境界上、決定的である。

### 4.6 コーパスの時間的収録範囲

当システムが遡れる版には下限がある。e-Gov の履歴データにも遡及下限があり（正確な範囲は Phase 0 の F-9 で実測する。未検証）、数十年前の溶け込み本文は取得できない可能性が高い。収録範囲という概念を持たないまま時点指定を受け付けると、「収録している最古の版を黙って表示する」という最悪の実装に流れる。これは §18 の最重要原則に対する直接の違反である。

各 Source は `coverage_from`（表示可能な最古の版の施行日）を持つ。基準日 D < `coverage_from` の場合の応答を次のとおり定める。

- 条文本文を表示しない。
- 「指定された日付（YYYY-MM-DD）の条文は本サービスの収録範囲外です。収録している最古の版は YYYY-MM-DD 施行版です」と表示する。
- 最古版を開く操作は利用者の明示的なクリックとし、開いた画面には「指定日と異なる版を表示しています」を常時表示する。
- API は該当版なしを 404 ではなく `COVERAGE_OUT_OF_RANGE` として返す（未収録法令の 404 と区別する）。

この状態は失敗ではなく正規の応答である。既存不適格案件では頻出するため、空状態の文言と導線を §19.15 で定義する。

---

## 5. 出典権威と統合状態

**既存ベースラインからの変更点（§1.3-2）。** 本節は調査記録 5-1-4 の知見を Normative 化したものである。

### 5.1 なぜ Authority Class だけでは足りないか

調査記録は、国土交通省の告示・通達一覧が全件網羅を保証せず、最新情報が未掲載の場合があり、官報掲載内容が優先すると明記していることを確認している。

つまり、同じ「告示」という Authority Class を持つ文書でも、実際に画面に出る本文は次のいずれかであり、信頼度がまったく異なる。

- 官報に掲載された原文
- 公布時の制定本文（その後の改正が反映されていない）
- 一部改正文（改め文。単独では読めない）
- 当サービスが改正文を機械的に統合した編集現行版

「公式サイトから取得したから完全・最新」と表示してはならない。この区別をデータモデルに持たないまま UI で頑張ることはできない。

### 5.2 二軸のモデル

**軸1: Authority Class（法的権威）**

```text
PRIMARY_LAW              法律
CABINET_ORDER            政令
MINISTERIAL_ORDINANCE    省令
NOTIFICATION             告示
LOCAL_ORDINANCE          条例
LOCAL_RULE               規則・細則
OFFICIAL_GUIDANCE        技術的助言・公式Q&A
ADMINISTRATIVE_REFERENCE 行政資料・運用基準
SECONDARY_COMMENTARY     解説・二次資料
```

**軸2: Consolidation State（本文の統合状態）**

```text
OFFICIAL_CONSOLIDATED    公式が現行全文として公開している本文
OFFICIAL_AS_ENACTED      公布時の制定本文
OFFICIAL_AMENDMENT       一部改正文（改め文）
DERIVED_CONSOLIDATED     当サービスが機械統合した編集現行版
UNKNOWN                  判別不能
```

**軸3: Verification Status（確認状態）**

```text
UNVERIFIED           取得のみ
MECHANICAL           機械検証済（構造・ハッシュ）
HUMAN_REVIEWED       人手確認済
GAZETTE_VERIFIED     官報原文と照合済
```

### 5.3 強制する制約

以下はコードとDB制約で強制する。UI の努力目標にしない。

1. `SECONDARY_COMMENTARY` は Primary Citation として EvidenceSnapshot に入れられない。
2. `DERIVED_CONSOLIDATED` かつ `verification_status < HUMAN_REVIEWED` の ProvisionVersion は、EvidenceSnapshot の Primary Citation に入れられない（API は 422 を返す）。参考資料としてなら添付できる。
3. `DERIVED_CONSOLIDATED` は、条文表示・検索結果・Evidence 出力・AI Context のすべてのレイヤーで「編集現行版」バッジを表示する。バッジのないレンダリング経路を作らない。
4. `DERIVED_CONSOLIDATED` の表示画面には、必ず公式原文（官報 PDF または公式掲載ページ）への導線を置く。
5. 公開前（`DRAFT`）の SourceVersion は利用者検索に出さない。

### 5.4 Publish 判断

`DERIVED_CONSOLIDATED` を新規に公開するには、Corpus Editor による HUMAN_REVIEWED 昇格を必須とする。機械統合の結果をそのまま公開しない。

この運用コストは MVP の事業性に直結するため、Phase 0 で「対象告示 50 件を人手確認する場合の所要工数」を実測する（§15.2）。

なお、本節が正常系で守られている限り、§5.3 の制約 2 は発火しない。これは矛盾ではなく多層防御である。本節の Publish 運用が一次防衛線、§5.3-2 の API 検証が運用ミスに対する最終防衛線であり、どちらか一方を「重複だから」と削除してはならない。

---

## 6. 引用アンカーと Citation Resolver

### 6.1 Citation Anchor の設計

Anchor は、Source 内の一時的な HTML id に依存させない。次の組合せから生成する。

```text
{jurisdiction}/{source_identity}/{provision_canonical_path}
例: jp/law/325AC0000000201/art52-2/para1/item3
    jp/mlit/notification/H12-KS-1400/art1
    jp/local/13000/ordinance/xxx/art5
```

補助情報として次を保持し、Anchor 単独に頼らない多重化を行う。

- `content_fingerprint`: 正規化本文のハッシュ
- `text_quote_selector`: 前後文脈つき引用（W3C Web Annotation の TextQuoteSelector 相当）
- `sequence`: Source 内の出現順

### 6.2 Anchor の版間移行

Source 改訂時、旧 Anchor が指していた箇所を新版で特定する。結果を 3 状態で表す。

```text
EXACT            canonical path と fingerprint が一致
MAPPED           path 変化ありだが quote selector で高信頼に同定（条番号繰下げ等）
REVIEW_REQUIRED  同定できない、または複数候補
```

`REVIEW_REQUIRED` の Annotation は、利用者画面で「元の条文が改正されました。位置を確認してください」と表示し、旧版の本文を並べて示す。**黙って近い場所へ付け替えない。**

### 6.3 Citation Resolver

**既存ベースラインからの変更点（§1.3-4）。** 検索クエリ解釈、条文中の参照抽出、AI 引用検証の 3 箇所が同一の引用解釈を必要とする。単一コンポーネントとして実装し、3 者から呼ぶ。分散実装は 3 者の挙動が食い違う保証しかない。

**インタフェース**

```text
resolve(text: string, context?: ProvisionVersionRef) -> CitationRef[]

CitationRef {
  law_identity: string | null      // 未特定なら null
  provision_path: string | null
  raw_text: string                 // 原文中の該当文字列
  span: [start, end]
  resolution_method: EXPLICIT | RELATIVE | ABBREVIATED | INFERRED
  confidence: float
}
```

**対応すべき表記**

| 種別 | 例 |
|---|---|
| 条番号（漢数字） | 第五十二条 |
| 条番号（算用数字） | 第52条 / 52条 |
| 枝番号 | 第52条の2 / 第五十二条の二 |
| 項 | 第2項 / 第二項 / ② |
| 号 | 第一号 / 第1号 / 一 |
| 別表 | 別表第一（い）欄 |
| 相対参照 | 前条 / 次条 / 同条 / 前項 / 同項 / 前二項 / 本条 |
| 法令略称 | 法 / 令 / 規則 / 基準法 / 建基法 |
| 告示番号 | 平成12年建設省告示第1400号 |
| 元号 | 令和7年 ↔ 2025年 |

**正規化パイプライン**

```text
NFKC 正規化
→ 漢数字→算用数字（条項号の数値部のみ。本文の数値は変換しない）
→ 元号→西暦（原表記を併記保持）
→ 法令略称の展開（context の法令に依存）
```

相対参照（前条・同項等）と略称（法・令）は `context` なしには解決できない。`context` が渡されない呼び出しでは `resolution_method = RELATIVE` の候補を返し、解決済みとして扱わない。

Resolver は Golden Test を持つ。対象コーパスから抽出した 500 件以上の実引用に対して期待結果を固定し、CI で回帰を検出する。

---

## 7. 参照関係（Reference Edge）

### 7.1 位置付け

Reference Edge は検索・ナビゲーション・AI 候補提示の共通基盤である。ただしグラフ DB は導入しない。PostgreSQL の隣接テーブルで表現し、深さ 2 までの探索に限定する。

深さ 2 に限る理由は、それ以上の推移的探索が実務上の意味を持たないことと、UI が発散するためである。

### 7.2 エッジ型

**既存ベースラインからの変更点（§1.3-3）。** 調査記録 9.6 は 40 種以上を定義しているが、その多くは Norm 層の概念であり、MVP に Norm 層は存在しない。実装できない型を定義しない。MVP は次の 5 種に限定する。

| 型 | 意味 | UI 表示 |
|---|---|---|
| `CITES` | 単純な引用・参照 | 参照 |
| `DELEGATES_TO` | 政令・省令・告示への委任 | 委任先 |
| `APPLIES_MUTATIS_MUTANDIS` | 準用（読替えを伴う場合あり） | 準用（読替えあり） |
| `DEFINES` | 用語の定義規定 | 定義 |
| `EXCEPTS` | ただし書き・適用除外 | 例外 |

改正関係（旧 `AMENDS`）はエッジとして表現しない。版の系譜は ProvisionVersion の有効期間連鎖（§4.2）が既に持っており、`reference_edge` テーブルの形状（版→条項）では版間関係を表現できないためである。改正履歴の照会は history API（§12.2）で提供する。

読替えを伴う準用について、MVP では**読替え後の本文を生成しない**。「準用・読替えあり」と表示し、読替え規定本文へ導線を出すにとどめる。自動読替えは誤りの温床であり、Norm 層なしには正しく実装できない。

### 7.3 抽出と確認

各エッジは次を保持する。

```text
extraction_method  RULE_BASED | LLM_ASSISTED | MANUAL
confidence         0.0 - 1.0
review_status      UNREVIEWED | APPROVED | REJECTED | CORRECTED
reviewed_by
anchor_text        抽出元の原文断片
```

`UNREVIEWED` かつ `confidence < 閾値` のエッジは、利用者 UI では「未確認の参照候補」セクションに分けて表示する。確認済みエッジと混ぜない。

参照先を解決できなかった参照（外部法令が未収録等）は、削除せず `unresolved` として保持し、「参照先が本サービスに未収録です」と表示する。**見えている参照を黙って消さない**ことが、見落とし防止という価値提案の根幹である。

---

## 8. 取込パイプライン

### 8.1 ステージ

```text
Scheduler / Manual Trigger
  ↓ Fetcher              — HTTP 取得、リトライ、タイムアウト
  ↓ Raw Artifact Store   — Object Storage へ原本を先に保存
  ↓ Hash Comparison      — 前版と同一なら以降をスキップ
  ↓ Parser               — SourceType 別。ParserVersion を記録
  ↓ Normalizer           — 文字正規化、構造整形
  ↓ Provision Segmenter  — 条・項・号・別表・附則へ分解
  ↓ Anchor Generator     — Canonical Anchor と fingerprint 生成
  ↓ Reference Extractor  — Citation Resolver 経由でエッジ抽出
  ↓ Validation           — §8.3 の検証
  ↓ Human Review Queue   — 必要なものだけ
  ↓ Publish              — SourceVersion を公開状態へ
  ↓ Index Projection     — 検索インデックス反映
```

### 8.2 原則

1. 各ステージは冪等とする。同じ入力と同じ ParserVersion から同じ出力を得る。
2. Raw Artifact を最初に保存する。Parser が落ちても原本は残す。
3. ParserVersion を必ず記録する。再処理時の差分要因を特定できるようにする。
4. Publish 前のデータを利用者検索に出さない。
5. ジョブは At-Least-Once 前提とし、Idempotency Key を持つ。
6. トランザクション内で Outbox へ書き、Background Worker が Projection を更新する。外部 Event Broker は導入しない。

### 8.3 Validation で落とすもの

- 条項号の階層が破綻している（項の親が条でない等）
- 前版に存在した Provision が理由なく消失している
- 同一 Provision に有効期間が重複する版が生じる
- Anchor の重複
- 本文が空、または極端に短い
- 文字化けの疑い（想定外の文字種の混入率）

上記のいずれかに該当する SourceVersion は自動 Publish しない。Review Queue へ送る。

### 8.4 SourceType 別 Parser

| SourceType | 想定形式 | 難度 | 備考 |
|---|---|---|---|
| e-Gov 法令 | 法令標準 XML | 低 | 構造が定義済み。最優先で実装 |
| 官庁告示（HTML） | HTML | 中 | 構造の統一性が低い |
| 官庁告示（テキストPDF） | PDF | 高 | 表・図・算式の欠落に注意 |
| 官庁告示（画像PDF） | PDF | 最高 | OCR。MVP では人手確認必須とする |
| 自治体例規 | HTML（例規集システム） | 中 | ベンダごとに構造が異なる |

各 Parser は Fixture Test を持つ。実ファイルを固定し、抽出結果の期待値を CI で検証する。

表・図・算式を含む文書は、欠落したまま表示しない。抽出できない場合は該当箇所に「原本を参照してください」と表示し、原本 PDF の該当ページへ遷移させる。

---

## 9. 検索

### 9.1 検索ルートの分離

利用者の検索意図は 3 系統あり、同一のランキングで扱わない。

| ルート | 入力例 | 処理 |
|---|---|---|
| 引用指定 | 「法52条2項」「令112条」 | Citation Resolver で解決し、該当条文へ直行 |
| キーワード | 「防火区画 面積」 | 全文検索 |
| 自然文 | 「用途変更で確認申請が要るのは」 | AI によるクエリ展開 → キーワード検索 |

引用指定が解決できた場合、全文検索結果より上位に「指定された条文」として別枠表示する。ランキング競争に混ぜない。

### 9.2 日本語トークナイズ

**既存ベースラインからの変更点（§1.3-5）。**

既存ベースラインは「初期は PostgreSQL Full Text Search から開始してよい」としているが、PostgreSQL の標準 `tsvector` は日本語のトークナイザを持たない。日本語を扱うには次のいずれかが必要である。

| 選択肢 | 方式 | 検証事項 |
|---|---|---|
| pg_bigm | N-gram | マネージド PostgreSQL で拡張が利用可能か |
| PGroonga | 形態素＋N-gram | 同上。利用可能なマネージドサービスは限られる |
| OpenSearch + Sudachi | 形態素 | 運用コストが増える。同義語辞書の運用が容易 |

**Phase 0 の必須検証項目とする。** 採用するマネージドDBで拡張が使えないことが後から判明すると、Index 設計と検索実装をやり直すことになる。拡張が使えない場合は最初から OpenSearch を採用する。

法令検索では、形態素解析の辞書に載らない専門語（「準耐火構造」「特定防火設備」「令8区画」）が多いため、形態素単独では取りこぼす。N-gram との併用、または専門語辞書の整備を前提とする。

### 9.3 正規化と表記揺れ

検索側・インデックス側の双方で同一の正規化を適用する。

- NFKC（全角英数・半角カナの統一）
- 漢数字・算用数字の相互展開（条項号）
- 元号・西暦の相互展開
- 法令略称の展開
- 送り仮名の揺れ（「取り扱い」「取扱い」「取扱」）

同義語辞書は運用データとして管理し、コードに埋め込まない。Search Evaluation Harness（§9.5）で効果を測ってから追加する。

### 9.4 インデックス単位とフィールド

インデックス単位は ProvisionVersion とする。

```text
law_title, law_title_kana, law_abbrev
provision_path, provision_label, heading
body, body_normalized
authority_class, consolidation_state, verification_status
jurisdiction, valid_from, valid_to
definition_terms          — この条項が定義する用語
reference_targets         — 参照先の provision_path 群
source_id, provision_id, provision_version_id
```

ランキングの優先要素:

1. 法令名・条番号の完全一致
2. 見出し一致
3. 定義語一致
4. 本文一致
5. Authority Class（Primary を優先。ただし関連度と別軸で表示する）
6. 基準日時点での有効性

`SECONDARY_COMMENTARY` を単純な一致度だけで上位に出さない。

検索順位が回答の確実性を意味しないことを UI 上で明示する。

### 9.5 Search Evaluation Harness

検索は主観で調整しない。Phase 2 の必須成果物として次を作る。

- 実務者インタビューから抽出した検索課題 50 件以上
- 各課題に対する期待 Provision の正解セット（専門家確認済み）
- Recall@10 / MRR の自動計測
- CI での回帰検出

目標: 主要検索課題の Recall@10 ≧ 80%。

Solo Track では課題数が 30 件（§15.8.3）であるため、この判定は正解セット 1〜2 件の誤りで結果が反転しうる規模である。ゲート判定の前に、正解セット自体を Domain Reviewer が確認済みであることを条件とする。

### 9.6 インデックス再構築の可用性

再インデックスは、稼働中のインデックスを直接更新せず、別名で新規構築 → Evaluation Harness で検証 → 参照切替 → 旧を削除、の手順で行う。PostgreSQL 系を採用した場合も同様に、新しい索引テーブルを構築してから参照先を切り替える。切替までの Index ラグは Observability のドメイン指標（§14.5）として常時可視化する。

---

## 10. 案件ワークスペースと Evidence

### 10.1 階層

```text
Organization
 └ Project（案件）
    ├ ApplicabilityContext[]（適用時点アンカー）
    └ ResearchQuestion（調査課題）
       ├ SavedItem[]（保存した条項）
       ├ Annotation[]（注釈）
       └ EvidenceSet（根拠集合、可変）
          └ EvidenceSnapshot[]（発行済み、不変）
```

### 10.2 保存時に固定するもの

SavedItem・Annotation の保存時、次を固定して記録する。後から変わらない。

```text
provision_version_id     参照した特定版
source_version_id        その版の出典
applicability_anchor     当時の active アンカー（種別と日付）
saved_at
```

これがなければ「なぜこの条文を根拠にしたのか」が後から再現できない。

### 10.3 EvidenceSet の構成

```text
Research Question       調査課題
Research Summary        調査者による要約（人が書く）
Primary Citations       法令原文への引用（Authority 制約あり §5.3）
Supporting References   参考資料
Annotations             注釈
Applicability Context   適用時点の記録
Open Questions          未解決事項
Reviewer Notes          レビュー所見
```

**結論と根拠を分離して表示する。** 要約だけが読まれて根拠が読まれない状態を UI で防ぐ。

### 10.4 Snapshot の不変性

```text
DRAFT → READY_FOR_REVIEW → CHANGES_REQUESTED → REVIEWED → ARCHIVED
```

- Draft 中は編集可能
- Snapshot 発行時に SnapshotHash を生成し、以降は変更不可
- Snapshot は SourceVersionId / ProvisionVersionId を固定するため、後日 Source が改正されても当時の内容を再現できる
- Snapshot 再現テストを CI に含める（§14.3 T-04）

`REVIEWED` は法的適合判定でも行政承認でもない。この旨を Snapshot の出力物にも明記する。

**不変性と個人情報削除の両立（墓標化）**

Snapshot の payload には案件名・注釈・要約が含まれ、個人情報が混入しうる。削除要求と不変性は正面から衝突するため、次の墓標（トゥームストーン）方式を正規の手順とする。

- Snapshot レコード自体は削除しない。payload を「削除済み」マーカーへ置換し、`redacted_at` と理由区分を記録する。
- SnapshotHash・発行者・発行日時・監査記録は保持する。第三者は「この Snapshot は存在したが、内容は削除された」ことを検証できる。
- 墓標化は通常の UPDATE 経路では実行できず、専用の管理操作としてのみ許可し、監査対象とする。
- 墓標化された Snapshot を参照する画面は、内容の代わりに削除済みであることと削除日を表示する。

### 10.5 出力と共有

- 権限付き共有リンク（組織外への公開はデフォルト無効）
- Markdown / PDF 出力
- 出力物には Source Metadata、Applicability Context、生成日時、免責文言を必ず含める
- Citation から本サービスの該当条文へ遷移できる恒久 URL を含める

### 10.6 過去案件の再利用

ResearchQuestion・Annotation・Citation を横断検索し、類似の過去調査を発見できる。組織境界を越えない。

再利用時は、当時の ApplicabilityContext と現時点の差分を提示する。「この調査は 2025-06-01 時点の条文に基づいています。以後 3 件の改正があります」と表示する。

---

## 11. AI 支援の責任境界

### 11.1 位置付け

AI は補助機能である。AI が停止しても、検索・閲覧・保存・共有・出力の中核機能は動作しなければならない。この性質を Feature Flag と縮退テストで担保する。

### 11.2 許可する機能

- 自然言語クエリから検索語候補への展開（実行前に利用者が編集できる）
- 検索結果の要約
- 関連条項候補の提示（自動保存しない）
- EvidenceSet の要約ドラフト生成（含まれる Citation のみを根拠とする）
- 調査漏れ候補の提示
- 専門用語の平易な説明

### 11.3 禁止する機能

- 適合判定・合否の提示
- Source 本文、Annotation、Review 結果の上書き
- Citation なしの法令回答
- Review 状態の自動遷移
- 適用時点・Jurisdiction・Authority の決定（これらは決定論的処理が制御する）

### 11.4 Grounding パイプライン

```text
User Query
 ↓ Query Normalization
 ↓ Legal Search（決定論）        ← 基準日・Jurisdiction をここで固定
 ↓ Candidate Selection
 ↓ Context Assembly              ← Retrieval Snapshot を保存
 ↓ AI Provider Gateway
 ↓ Citation Validator            ← §11.5
 ↓ Response Formatter
```

適用時点と Jurisdiction は AI に決めさせない。検索段階で決定論的に固定し、Context に含めて渡す。

### 11.5 Citation Validator

AI 出力を利用者に見せる前に、次を機械検証する。

1. 引用された provision_version_id が Context 内に存在する
2. 引用対象が指定基準日時点で有効である
3. 表示される抜粋が Source 本文と文字列一致する
4. `SECONDARY_COMMENTARY` のみで法令上の結論を構成していない
5. `DERIVED_CONSOLIDATED` を Primary Citation としていない

いずれかに失敗した場合、回答を破棄するか「検索候補のみ」に降格する。検証を通らない回答を法令回答として表示しない。

### 11.6 プロンプトインジェクション

取り込んだ外部文書（自治体 PDF 等）に、AI への指示とみなせる文字列が含まれうる。**外部文書は常にデータであり、命令ではない。**

- Context に入れる本文は明示的なデリミタで囲み、指示として解釈しない旨をシステムプロンプトで固定する
- 取込時に指示様の文字列パターンを検出し、Review Queue へ送る
- Citation Validator が本文一致を検証するため、本文にない内容を生成した場合は検出できる

### 11.7 AI 出力の記録と表示

- AI 生成物には常に「AI 生成」を表示する
- EvidenceSet へ保存する場合、AI 生成であることを保持する
- AI 出力は自動的に `REVIEWED` へ遷移しない
- `AiInteraction` として、モデル名・プロンプト版・Retrieval Snapshot・出力・検証結果を記録する

### 11.8 評価指標

モデル品質ではなくタスク品質を測る。

- 正しい一次 Source へ到達した割合
- Citation が主張を支持する割合
- 誤った施行時点を使用した割合
- 「不明」を「不明」と回答した割合
- 関連例外の見落とし率
- 人手による修正量

---

## 12. アプリケーション構成

### 12.1 アーキテクチャスタイル

Modular Monolith。ネットワーク分割はしない。

```text
Web Client
 ├ Legal Reader        条文閲覧・時点切替・参照ナビ
 ├ Search Workspace    検索
 ├ Project Workspace   案件・調査課題・注釈・Evidence
 └ Admin Console       取込状況・Review Queue・監査

API Application（単一デプロイ単位）
 ├ Identity Module
 ├ Legal Corpus Module     ← 法令データの System of Record
 ├ Search Module
 ├ Project Module
 ├ Evidence Module
 ├ Review Module
 ├ AI Assistance Module
 └ Administration Module

Background Worker（同一コードベース、別プロセス）
 ├ Ingestion Jobs
 ├ Index Projection
 ├ Export Generation
 └ AI Request Execution

Infrastructure
 ├ PostgreSQL（System of Record）
 ├ Object Storage（原本・出力）
 ├ Search Index
 ├ Job Queue
 └ Observability
```

各モジュールは Application Service / Domain Model / Repository Interface / スキーマ所有 / 公開モジュール API を持つ。DB は共有するが、他モジュールのテーブルを直接更新しない。この規約は静的解析または CI のスキーマ所有チェックで強制する。

Web Client の画面構成・遷移・状態・デザイントークンは §19 に定める。

### 12.2 API

```text
# Corpus
GET  /sources
GET  /sources/{id}
GET  /sources/{id}/versions
GET  /provisions/{id}
GET  /provisions/{id}/at?date=&anchorId=
GET  /provisions/{id}/history
GET  /provisions/{id}/references
GET  /provisions/{id}/diff?from=&to=
GET  /search

# Project
POST   /projects
GET    /projects/{id}
PATCH  /projects/{id}
POST   /projects/{id}/applicability-anchors
POST   /projects/{id}/questions
POST   /projects/{id}/saved-items
POST   /projects/{id}/annotations
GET    /projects/{id}/search

# Evidence
POST /research-questions/{id}/evidence-sets
PATCH /evidence-sets/{id}
POST /evidence-sets/{id}/items
POST /evidence-sets/{id}/submit-review
POST /evidence-sets/{id}/snapshots
GET  /evidence-snapshots/{id}
GET  /evidence-snapshots/{id}/export?format=

# AI（非AI機能と明確に分離）
POST /ai/search-assist
POST /ai/summarize-evidence
POST /ai/suggest-related-provisions

# Admin
GET  /admin/ingestion-jobs
GET  /admin/review-queue
POST /admin/source-versions/{id}/publish
GET  /admin/audit
```

`/provisions/{id}/at` の時点解決は `date` のみを入力とする。`anchorId` は任意で、その日付がどの ApplicabilityAnchor に由来するかを監査・表示用に記録するものであり、`anchorId` から日付を導出しない。

**全応答の必須メタデータ**

```json
{
  "data": {},
  "meta": {
    "reference_date": "2026-07-29",
    "applicability_anchor": "CONFIRMATION_APPLICATION",
    "jurisdiction": "jp/13000",
    "corpus_version": "2026-07-29T03:00:00Z",
    "request_id": "..."
  }
}
```

更新系は楽観ロック（`If-Match` / version）を用いる。

### 12.3 権限

```text
ORGANIZATION_ADMIN   組織管理、メンバー招待
RESEARCHER           自組織 Project の作成・編集
REVIEWER             割当てられた EvidenceSet のレビュー
CORPUS_EDITOR        SourceVersion の Publish（自社運用のみ）
SYSTEM_ADMIN         システム運用
```

- `SYSTEM_ADMIN` は法令内容の承認権限を自動的には持たない。`CORPUS_EDITOR` と分ける。
- Public な EvidenceSnapshot は明示操作なしに公開しない。
- テナント境界は PostgreSQL Row Level Security とアプリ層の二重で担保する。
- RLS の対象となる全テーブル（project、applicability_anchor、saved_item、annotation、evidence_set、evidence_snapshot 等）は `organization_id` を非正規化して保持し、ポリシーは単純な等値比較だけで書く。RLS ポリシー内に JOIN・サブクエリを書かない。親テーブル経由の推移的な境界判定は、実装漏れと性能劣化の両方を招く。

### 12.4 監査

```text
AuditId, OccurredAt, ActorId, OrganizationId,
Action, ResourceType, ResourceId,
BeforeHash, AfterHash, CorrelationId, ClientContext
```

追記専用。監査対象は、SourceVersion 登録・Publish、Source Metadata 変更、Project 作成・削除、EvidenceSnapshot 発行、Review 状態変更、権限変更、AI 出力の保存。

機密本文を Audit Payload へ無制限に複製しない（ハッシュで代替）。

---

## 13. 物理設計

### 13.1 主要テーブル

概念設計を確定させるための抜粋。型・制約は実装時に精査する。

```sql
-- 法令コーパス
CREATE TABLE source (
  source_id           uuid PRIMARY KEY,
  canonical_uri       text NOT NULL,
  title               text NOT NULL,
  title_kana          text,
  abbrev              text[],
  publisher           text NOT NULL,
  authority_class     authority_class_enum NOT NULL,
  jurisdiction        text NOT NULL,          -- jp / jp-13000 等
  source_type         source_type_enum NOT NULL,
  status              text NOT NULL,
  UNIQUE (canonical_uri)
);

CREATE TABLE source_version (
  source_version_id   uuid PRIMARY KEY,
  source_id           uuid NOT NULL REFERENCES source,
  content_hash        text NOT NULL,
  raw_object_key      text NOT NULL,
  normalized_object_key text,
  parser_version      text NOT NULL,
  consolidation_state consolidation_state_enum NOT NULL,
  verification_status verification_status_enum NOT NULL,
  promulgated_at      date,
  valid_from          date,
  valid_from_status   valid_from_status_enum NOT NULL DEFAULT 'FIXED',
  valid_to            date,
  retrieved_at        timestamptz NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,            -- NULL = 未公開
  processing_status   text NOT NULL,
  CHECK (valid_from_status <> 'FIXED' OR valid_from IS NOT NULL),
  UNIQUE (source_id, content_hash)
);

CREATE TABLE provision (
  provision_id        uuid PRIMARY KEY,
  source_id           uuid NOT NULL REFERENCES source,
  canonical_path      text NOT NULL,          -- art52-2/para1/item3
  provision_type      provision_type_enum NOT NULL,  -- ARTICLE/PARAGRAPH/ITEM/TABLE/SUPPLEMENTARY
  stable_label        text NOT NULL,          -- 第52条の2第1項第3号
  UNIQUE (source_id, canonical_path)
);

CREATE TABLE provision_version (
  provision_version_id uuid PRIMARY KEY,
  provision_id        uuid NOT NULL REFERENCES provision,
  source_version_id   uuid NOT NULL REFERENCES source_version,
  citation_anchor     text NOT NULL,
  heading             text,
  body                text NOT NULL,
  body_normalized     text NOT NULL,
  content_fingerprint text NOT NULL,
  text_quote_prefix   text,
  text_quote_suffix   text,
  sequence            int NOT NULL,
  valid_from          date,                   -- FIXED の場合のみ必須（下の CHECK。§4.2）
  valid_from_status   valid_from_status_enum NOT NULL DEFAULT 'FIXED',
  valid_to            date,
  CHECK (valid_from_status <> 'FIXED' OR valid_from IS NOT NULL),
  UNIQUE (citation_anchor, valid_from)
);

-- 同一 Provision の有効期間重複を DB で禁止する
-- 要 btree_gist 拡張（uuid の等値比較に必要。可用性は F-7 で確認する）
ALTER TABLE provision_version ADD CONSTRAINT no_overlapping_validity
  EXCLUDE USING gist (
    provision_id WITH =,
    daterange(valid_from, valid_to, '[)') WITH &&
  ) WHERE (valid_from_status = 'FIXED');

CREATE TABLE reference_edge (
  edge_id             uuid PRIMARY KEY,
  from_provision_version_id uuid NOT NULL REFERENCES provision_version,
  to_provision_id     uuid REFERENCES provision,      -- NULL 可（未解決）
  to_external_ref     text,                            -- 未収録法令等
  edge_type           edge_type_enum NOT NULL,
  anchor_text         text NOT NULL,
  extraction_method   text NOT NULL,
  confidence          real NOT NULL,
  review_status       text NOT NULL DEFAULT 'UNREVIEWED',
  reviewed_by         uuid,
  CHECK (to_provision_id IS NOT NULL OR to_external_ref IS NOT NULL)
);

-- 案件側
CREATE TABLE project (
  project_id          uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,
  name                text NOT NULL,
  jurisdiction        text NOT NULL,
  status              text NOT NULL,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE applicability_anchor (
  anchor_id           uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,    -- RLS 用に非正規化（§12.3）
  project_id          uuid NOT NULL REFERENCES project,
  anchor_kind         anchor_kind_enum NOT NULL,
  anchor_date         date NOT NULL,
  label               text,
  is_active           boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX one_active_anchor
  ON applicability_anchor (project_id) WHERE is_active;

CREATE TABLE saved_item (
  saved_item_id       uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,    -- RLS 用に非正規化（§12.3）
  research_question_id uuid NOT NULL,
  provision_version_id uuid NOT NULL REFERENCES provision_version,
  source_version_id   uuid NOT NULL REFERENCES source_version,
  anchor_kind         anchor_kind_enum NOT NULL,
  anchor_date         date NOT NULL,
  saved_by            uuid NOT NULL,
  saved_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE annotation (
  annotation_id       uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,    -- RLS 用に非正規化（§12.3）
  project_id          uuid NOT NULL REFERENCES project,
  research_question_id uuid,
  provision_version_id uuid NOT NULL REFERENCES provision_version,
  citation_anchor     text NOT NULL,
  text_selector       jsonb NOT NULL,   -- {prefix, exact, suffix, start, end}
  quoted_text         text NOT NULL,
  note                text,
  anchor_status       anchor_status_enum NOT NULL DEFAULT 'EXACT',
  author_id           uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_snapshot (
  evidence_snapshot_id uuid PRIMARY KEY,
  organization_id     uuid NOT NULL,    -- RLS 用に非正規化（§12.3）
  evidence_set_id     uuid NOT NULL,
  snapshot_number     int NOT NULL,
  snapshot_hash       text NOT NULL,
  anchor_kind         anchor_kind_enum NOT NULL,
  anchor_date         date NOT NULL,
  payload             jsonb NOT NULL,   -- 固定した citation/annotation の完全な参照集合
  generated_at        timestamptz NOT NULL DEFAULT now(),
  generated_by        uuid NOT NULL,
  redacted_at         timestamptz,      -- §10.4 墓標化。NULL 以外なら内容削除済み
  UNIQUE (evidence_set_id, snapshot_number)
);
-- 墓標化専用経路（§10.4）を除き、UPDATE / DELETE をトリガで禁止する
```

`no_overlapping_validity` の EXCLUDE 制約は、§4.2 の「同一時点に複数版が有効になってはならない」をアプリ層でなく DB 層で保証するためのものである。この不整合はアプリのバグで容易に混入し、発生すると誤った条文を表示する。

### 13.2 ストレージ配分

| 保存先 | 対象 |
|---|---|
| PostgreSQL | ドメインエンティティ、版メタデータ、案件・Evidence・Review、権限、監査、ジョブ |
| Object Storage | 原本（HTML/XML/PDF）、正規化成果物、出力ファイル、Snapshot パッケージ |
| Search Index | ProvisionVersion の検索ドキュメント（再構築可能） |

### 13.3 デプロイ

Pilot 期の構成。単一リージョン、単一アプリケーションデプロイ。

```text
Managed Container Platform
 ├ Web/API
 ├ Background Worker
 └ Scheduled Ingestion Worker
Managed PostgreSQL
Managed Object Storage
Search（§9.2 の決定に従う）
Managed Queue
Centralized Logging / Metrics / Tracing
```

Infrastructure as Code で管理する。環境は Development / Test / Staging / Pilot Production の 4 面。

### 13.4 技術選定の制約

特定言語・フレームワークは本書で固定しない。次を満たすこと。

UTF-8 日本語処理 / トランザクション / マイグレーション管理 / OpenAPI 生成 / Background Job / Object Storage 接続 / 構造化ログ / 自動テスト / 依存関係スキャン / IaC。

チームが既に運用できる成熟技術を優先する。習熟コストの高い技術を理念だけで採用しない。

---

## 14. 非機能要件

### 14.1 可用性・性能

行政基幹システム級ではなく、Pilot SaaS として設定する。

| 項目 | 目標 |
|---|---|
| 月間可用性 | 99.5% |
| 条文表示 P95 | 1 秒以内 |
| 検索 P95 | 2 秒以内 |
| 案件保存 P95 | 1 秒以内 |
| Snapshot 生成 | 10 秒以内 |
| Source 更新反映 | 公式更新確認後 24 時間以内 |
| RPO | 24 時間以内 |
| RTO | 8 時間以内 |

取込障害が、閲覧中の公開済み Version に影響しないこと。

### 14.2 セキュリティ・プライバシー

- Managed OIDC による認証
- 組織単位の RBAC ＋ PostgreSQL RLS
- 保存時・通信時暗号化
- Secret 管理（環境変数への平文埋め込み禁止）
- 依存関係スキャンを CI に組込
- Backup / Restore の実地訓練（Phase 5 で実施）
- AI Provider への送信内容の制御（案件個人情報の送信可否を設定で制御）
- 要配慮個人情報は原則収集しない。Project への個人情報入力に関する利用規約・保持期間・削除手順を定義する

初期段階で Blockchain、独自 PKI、全面的な Zero Trust を構築しない。Package Signing、Key Rotation、Transparency Log、外部タイムスタンプは後続とする。

### 14.3 テスト

**単体・結合に加えて、次の横断テストを必須とする。**

| ID | 対象 | ケース |
|---|---|---|
| T-01 | 時点境界 | 施行日前日 / 当日 / 失効日前日 / 当日 / 時刻情報なし / 未確定施行日 |
| T-02 | Anchor 安定性 | 文言修正 / 項追加 / 項削除 / 条番号繰下げ / 附則追加 |
| T-03 | テナント分離 | ID 推測 / 検索結果 / Export URL / 監査閲覧 / Background Job |
| T-04 | Snapshot 再現 | Source 改正後 / Index 再構築後 / アプリ更新後 / AI Provider 変更後 |
| T-05 | AI Grounding | Citation 不存在 / 本文不一致 / 基準日不一致 / 二次資料のみ / インジェクション含有 Source |
| T-06 | Citation Resolver | 実引用 500 件の Golden Test |
| T-07 | 縮退 | AI 停止時に中核機能が動作する |

### 14.4 指標

**既存ベースラインからの変更点（§1.3-6）。**

**North Star（Pilot 期）**

> 同一調査タスクにおける、有効条文到達時間の中央値短縮率

Baseline（Phase 0 で計測した現行手段の所要時間）との比較で測る。目標 30% 以上短縮。

**準主指標**

> EvidenceSnapshot の第三者再現成功率（目標 90% 以上）

Evidence Set 数そのものは、Pilot 規模では週数件しか生成されず指標として分散が大きいため、North Star にはしない。カウンタとしては保持する。

**先行指標**: Weekly Active Researchers / Project あたり保存 Citation 数 / ResearchQuestion 完了率 / Review 依頼率 / Reference Edge 経由の遷移率 / Search Zero Result 率

**ガードレール指標**（いずれも 0 または限りなく 0 を目標）: 誤った Version 表示件数 / Citation 不整合件数 / AI 無根拠回答率 / 権限事故 / Snapshot 再現失敗件数 / 時点解決の DataIntegrityError 件数

### 14.5 Observability

技術指標: API レイテンシ・エラー率、Job 失敗率、Parser 実行時間、検索レイテンシ、Index ラグ、DB 飽和度。

ドメイン指標: Source 更新遅延、未確認 SourceVersion 数、壊れた Citation 数、時点解決の曖昧件数、Anchor 移行失敗数、Snapshot 再現失敗数、AI Citation 検証失敗率。

HTTP リクエスト・Background Job・AI 呼出・監査イベントを Correlation ID で関連付ける。

### 14.6 アクセシビリティ

主要画面は WCAG 2.2 AA を目標とする。スクロール型の長文閲覧が中核体験であるため、キーボード操作・フォーカス管理・文字サイズ変更への対応を優先する。

---

## 15. 実装計画

### 15.1 フェーズ

```text
Phase 0  Corpus Feasibility（先行・単独ゲート）
Phase 0' User Research（Phase 0 と並行可）
Phase 1  Corpus Foundation
Phase 2  Temporal Browser & Search
Phase 3  Project Workspace
Phase 4  Evidence & Review
Phase 5  AI Assistance & Hardening
Phase 6  Pilot & Decision Gate
```

> **本プロジェクトの実行計画は §15.9 の Solo Track を採用する。** 本節および §15.4 は、各フェーズが満たすべき内容と Exit Criteria の定義として参照する。実行単位・工期・優先順位は §15.9 が優先する。

### 15.2 Phase 0: Corpus Feasibility（先行）

**既存ベースラインからの変更点（§1.3-7）。** これを User Research と並列にせず、先行させる。

理由は、結果によってプロダクト定義そのものが変わるためである。告示の溶け込み済み現行全文が公式に入手できない場合、選択肢は次の 3 つになり、いずれも事業判断を要する。

1. 自製の編集現行版を人手確認込みで提供する（運用コストを商品原価に組み込む）
2. 告示は原文（制定本文＋改正文）のみ提供し、統合は利用者に委ねる（価値提案が弱まる）
3. 対象テーマを、告示依存の少ない領域へ変更する

**実施項目**

| # | 内容 | 合格条件 |
|---|---|---|
| F-1 | Source Inventory | 対象法令・告示・条例の公開主体、URL、形式、更新方法、利用条件を一覧化 |
| F-2 | e-Gov Parser Spike | 法令標準 XML から条項号の抽出率 99% 以上 |
| F-3 | 告示 Parser Spike | 50 件中 45 件以上で出典・文書番号・公布日を取得。表・図・算式を含む文書で欠落表示しない |
| F-4 | 溶け込み実現性 | 50 件について「公式現行全文が存在するか」を判定。存在しないものについて自製統合の所要工数を実測 |
| F-5 | Version Diff Spike | 同一法令の 2 版以上で Provision 単位の差分再現。施行日情報の取得可能性を確認 |
| F-6 | Citation Resolver Spike | 実引用 200 件で解決率 90% 以上 |
| F-7 | 日本語検索基盤と拡張の可用性確認 | 採用候補のマネージド PostgreSQL で pg_bigm / PGroonga と btree_gist が使えるか。使えない場合の OpenSearch 構成の見積 |
| F-8 | 利用条件の法的確認 | e-Gov データ、自治体例規、告示 PDF の再配布・加工条件 |
| F-9 | 履歴版の遡及範囲実測 | 法・令・規則それぞれで取得可能な最古の版を確認し、各 Source の `coverage_from`（§4.6）初期値を確定 |

**Exit Criteria**: F-1〜F-9 を完了し、上記 3 択のいずれを採るかを決定して ADR に記録する。

### 15.3 Phase 0': User Research（並行）

| # | 内容 | 合格条件 |
|---|---|---|
| U-1 | 実務者インタビュー | 10 名以上。調査手順・利用 Source・困難・成果物を記録 |
| U-2 | Baseline 計測 | 3 種類以上の調査タスクで現行手段の所要時間と誤りを計測。Pilot 比較に使える手順書を残す |
| U-3 | 検索課題の収集 | Search Evaluation Harness 用の課題 50 件と正解セットの原案 |
| U-4 | Design Partner 確保 | 3 組織以上の参加意思 |

**Exit Criteria**: 上位 3 課題が複数組織で再現し、有償利用または実証参加の意思を確認できること。

### 15.4 Phase 1〜6 の要点と Exit Criteria

**Phase 1: Corpus Foundation**

Repository / CI / IaC / 環境構築、認証と組織管理、Source Registry、取込パイプライン、Publish ワークフロー。

Exit: 最低 1 法令を End-to-End で取得・構造化・公開できる。Raw Source から公開 Provision まで再現できる。SourceVersion 不変性テストが通る。

**Phase 2: Temporal Browser & Search**

Citation Anchor 生成、時点解決クエリ、履歴表示、差分表示、Index Projection、キーワード検索、Search Evaluation Harness、Reference 抽出とレビュー、参照ナビ UI。

Exit: 対象コーパスを基準日指定で閲覧できる。主要検索課題で Recall@10 ≧ 80%。Citation URL が安定して再表示できる。T-01・T-02・T-06 が通る。

**Phase 3: Project Workspace**

Project CRUD、ApplicabilityContext、メンバー管理、ResearchQuestion、SavedItem、Annotation、Anchor 移行状態表示、案件内検索。

Exit: 実務者が 1 つの調査タスクを Project 内で完了できる。保存した根拠を別ユーザーが同じ Version で開ける。T-03 が通る。

**Phase 4: Evidence & Review**

EvidenceSet 編集、完全性チェック、レビュー依頼・コメント・完了、不変 Snapshot、共有ビュー、Export。

Exit: Researcher → Reviewer の End-to-End フローが成立。T-04 が通る。Pilot 用成果物を Export できる。

**Phase 5: AI Assistance & Hardening**

AI Gateway、Context Builder、Citation Validator、検索語支援、Evidence 要約、脅威モデリング、Backup/Restore 訓練、監査レビュー、Pilot オンボーディング、フィードバック収集。

Exit: Security Critical Issue が解消。Backup/Restore 試験成功。T-05・T-07 が通る。AI Citation 付与率 100%。

**Phase 6: Pilot & Decision Gate**

Baseline と同一タスクを本システムで実施し、時間・誤り・見落とし・レビュー修正量を計測。定量・定性の両面で評価。

判断: `GO`（拡大） / `ITERATE`（改善して再 Pilot） / `PIVOT`（対象 JTBD またはプロダクト形態の変更） / `STOP`。

### 15.5 Pilot 成功条件

1. 10 名以上の実務利用者が参加
2. 3 組織以上で利用
3. 30 件以上の実案件または相当課題で検証
4. 基準日時点の Provision 表示正確性が専門家確認で 99% 以上
5. 主要検索課題の Recall@10 が 80% 以上
6. EvidenceSnapshot の第三者再現成功率 90% 以上
7. 法令調査時間の中央値が従来比 30% 以上短縮
8. 重大な Authority / Version 誤表示が 0 件
9. AI 出力の Citation 付与率 100%
10. Pilot 利用者の過半数が継続利用を希望

数値の改訂は可能だが、改訂理由を ADR として残す。

### 15.6 スコープ変更手続

MVP へ機能を追加するには、次をすべて満たすこと。

1. Primary User の主要 JTBD に直接寄与する
2. Pilot 成功指標のいずれかを改善する
3. 既存機能で代替できない
4. Delivery Risk を明示できる
5. Product Owner と Domain Reviewer が承認する

### 15.7 Rule 実現性の並行トラック

MVP 本線から分離した小規模検証として実施してよい。本線の依存関係に含めない。

**Solo Track では S5（Pilot）完了まで着手しない。** 並行トラックは本線と可処分時間を奪い合うため、1 名体制では本線の遅延要因にしかならない。Rule Candidate は Pilot の実利用ログから抽出するほうが、机上で選ぶより精度が高い。

- 実務頻度の高い Norm Candidate を 20〜30 件収集
- `Machine-Evaluable` / `Partially-Evaluable` / `Review-Required` に分類
- JSON Rule Schema を試作（DSL は作らない）
- Fact Dictionary の最小版を作成
- 手作業で期待結果を作り、簡易 evaluator で再現性を確認

**Gate**: 20 件以上が専門家レビュー済み、80% 以上で Fact 定義が安定、Rule 表現の共通パターンが確認でき、Missing Fact の原因が分類でき、説明文の必要構造が確認できること。これを満たすまで専用 DSL / Compiler / Runtime へ進まない。

### 15.8 体制（採用: Solo Track）

**本プロジェクトは Solo Track を採用する。** 実装は 1 名＋AI 支援を前提とし、§15.1 のフェーズを §15.9 のとおり切り直す。

#### 15.8.1 必須の体制

| 役割 | 配置 | 兼任可否 |
|---|---|---|
| Product Owner / 実装 / 運用 | 本人 1 名 | — |
| 建築法令 Domain Reviewer | **外部 1〜2 名（必須）** | **兼任不可** |
| Design Partner 窓口 | Pilot 参加組織側 1 名 | 可 |

Domain Reviewer を本人が兼任してはならない。理由は次のとおりである。

本プロダクトの価値は「表示している条文が、指定した時点において正しい」ことに全面的に依存する。しかしこの正しさは、実装者が AI を用いても自己検証できない。法令本文の正誤、告示の統合結果の妥当性、参照関係の抽出精度は、建築実務の知識を持つ人間にしか判定できない。ここを兼任にすると、動くものは速く作れるが、内容が誤っているまま Pilot に出ることになる。

**Domain Reviewer の稼働量の目安**

| フェーズ | 内容 | 目安 |
|---|---|---|
| Phase 0 | 対象テーマの妥当性確認、検索課題 50 件の正解セット確認 | 8〜12 時間 |
| Phase 1〜2 | 構造化結果の抽出精度確認、告示の統合結果確認 | 月 4〜8 時間 |
| Phase 2 | Citation Resolver の Golden Test 期待値確認 | 4〜6 時間 |
| Phase 6 | Pilot 成果の正確性検証（成功条件 4 の判定） | 8〜12 時間 |

有償で確保する。無償の善意に依存すると、最も削ってはならない工程が最初に止まる。

#### 15.8.2 削るもの・削らないもの

**削る**

- AI 機能を Pilot から外す（実装はするが Feature Flag で無効のまま Pilot する）
- 参照グラフの可視化 UI（一覧表示に留める）
- 差分表示の高度化（機械差分＋公式新旧対照表へのリンクに留める）
- Review 専用画面（EvidenceSet 画面内のステータスとコメントで代替）
- 自治体例規の自動取込パイプライン（§15.9 の C-2 で代替）
- 課金機能

**削らない**

1. 法令時間モデル（§4）
2. Consolidation State と出典表示（§5）
3. Citation Anchor と Resolver（§6）
4. EvidenceSnapshot の不変性（§10.4）

この 4 つは、後から追加するとデータの作り直しになる。UI と AI は後から足せるが、これらは足せない。Solo Track で工期が苦しくなったときに削る候補から、明示的に除外する。

#### 15.8.3 スコープの縮小

| 項目 | 元の設定 | Solo Track |
|---|---|---|
| 告示 | 30〜50 件 | **15〜20 件** |
| 自治体 | 1 自治体（自動取込） | **1 自治体（手動登録）** |
| Pilot 規模 | 3 組織 10 名 | **1〜2 組織 5 名** |
| 検索課題 | 50 件 | 30 件 |

自治体条例は、パーサを書かずに Corpus Editor 画面から本文を手動登録する。取得元 URL、取得日時、`consolidation_state`、`verification_status` は自動取込と同一の必須項目として記録する。**データモデルは妥協せず、取込の自動化だけを後回しにする。** これにより、自治体差という価値提案を維持したまま、例規システムのベンダ別 HTML 解析（§8.4）を Pilot 後へ送れる。

### 15.9 Solo Track のフェーズ構成

```text
S0  Corpus Feasibility                        3週
S1  Corpus Foundation                         6週
S2  Temporal Browser & Search                 8週
S3  Workspace & Evidence（Phase 3+4 統合）     8週
S4  Hardening                                 3週
S5  Pilot                                     4週
                                     合計    32週
```

フルタイム換算で約 7〜8 か月である。兼業であればこの 1.5〜2 倍を見込む。この数字を短く見積もらないこと。工期超過の主因は実装ではなく、コーパスの品質確認と例外対応に費やす時間である。

**S0（3週）** — §15.2 の F-1〜F-9 を実施する。§15.3 の U-1〜U-4 は、Design Partner 候補へのヒアリングとして S0 と並行して行う。10 名は集まらない前提で、5 名以上・2 組織以上を目標とする。**S0 の Exit Criteria は緩めない。** ここで告示の入手可否が確定しなければ、S1 へ進まない。

**S1（6週）** — CI/IaC/認証/Source Registry/取込パイプライン/Publish。e-Gov 法令標準 XML の Parser のみを実装する。告示 Parser は S2 へ送る。Exit は「建築基準法 1 本を End-to-End で公開できる」。

**S2（8週）** — Citation Anchor、時点解決、履歴、Index Projection、キーワード検索、Search Evaluation Harness、告示 Parser、Reference 抽出。参照ナビは一覧表示のみ。Exit は Recall@10 ≧ 80%、T-01・T-02・T-06 の通過。

**S3（8週）** — Project、ApplicabilityContext、ResearchQuestion、SavedItem、Annotation、EvidenceSet、Snapshot、Export。Project と EvidenceSet を単一画面で扱い、Review は同画面内のステータス遷移とコメントで実現する。Exit は T-03・T-04 の通過と Export の成立。

**S4（3週）** — 脅威モデリング、Backup/Restore 訓練、監査確認、オンボーディング資料、免責文言、フィードバック導線。AI は Feature Flag を無効のまま残す。

**S5（4週）** — Pilot 実施と Go/No-Go 判断。

#### 15.9.1 各フェーズの中止条件

Solo Track では撤退判断が遅れると回復できない。次に該当したら、次フェーズへ進まずに §15.10 の判断へ戻る。

| フェーズ | 中止・再検討条件 |
|---|---|
| S0 | 告示の統合が 1 件あたり 2 時間を超える、または対象法令の 5% 以上で条項構造を抽出できない |
| S1 | 6 週で 1 法令を End-to-End 公開できない |
| S2 | Recall@10 が 60% に届かない、または Citation Resolver の解決率が 80% を下回る |
| S3 | Domain Reviewer が構造化結果の誤りを月 10 件以上指摘する状態が続く |
| S5 | 調査時間短縮が 10% 未満 |

### 15.10 Solo Track における Pilot 成功条件

§15.5 の 1〜3 を次に置き換える。4〜8 は**置き換えない**。

1. 5 名以上の実務利用者が参加
2. 1 組織以上、可能なら 2 組織で利用
3. 15 件以上の実案件または相当課題で検証

9（AI 出力の Citation 付与率）は、AI を Pilot 対象外とするため適用しない。

正確性に関する条件（4: 時点表示正確性 99%、6: Snapshot 再現成功率 90%、8: 重大な Authority / Version 誤表示 0 件）は緩和しない。規模は縮小できるが、正確性の基準を下げると、このプロダクトを作る理由そのものが消える。

---

## 16. 未解決事項

本書の作成時点で決定しておらず、Phase 0 で決める項目を明示する。**これらを決定済みとして扱わないこと。**

| # | 項目 | 決定時期 | 影響 |
|---|---|---|---|
| ~~O-1~~ | ~~告示の現行全文の入手可否と、自製統合の運用可否~~ | **決定済** | **案B**：告示は原文（案文＋改正履歴）のみ提供。溶け込み現行全文は提供しない（ADR-023） |
| O-2 | 日本語検索基盤（pg_bigm / PGroonga / OpenSearch） | Phase 0 (F-7) | Index 設計・インフラ構成 |
| O-3 | 対象テーマの最終確定（防火・避難 or 用途変更） | Phase 0 終了時 | コーパス範囲・検索評価セット |
| O-4 | 対象自治体の確定 | Design Partner 確保後 | 手動登録の対象範囲（例規 Parser は Pilot 後） |
| ~~O-5~~ | ~~e-Gov データ・自治体例規・告示 PDF の再配布条件~~ | **確認完了** | e-Gov・国交省は PDL1.0（CC BY 4.0 互換）で自由利用可。自治体例規は条文が著作権法第13条で自由だが編集物は自治体ごとに異なる（[F-8](../s0-findings/F-8-legal-terms.md)） |
| O-6 | 実装言語・フレームワーク | Phase 1 着手時 | — |
| O-7 | 課金モデル（組織単位 / 席単位 / 従量） | Phase 6 以降 | MVP では課金機能を実装しない |
| ~~O-8~~ | ~~体制~~ | **決定済** | Solo Track を採用（§15.8、ADR-016） |
| O-9 | Domain Reviewer の人選と契約条件 | S0 着手前 | **未確保のまま S1 へ進まない** |

以下は、本書が調査記録から引き継いだが、一次情報での再確認を推奨する事実である。調査記録の記載を Normative として扱う前に検証すること。

- e-Gov 法令検索の API Version 2 の提供内容と利用条件（履歴版の時間的遡及範囲を含む）
- 国土交通省の告示・通達一覧の網羅性に関する注記の現行文言
- 2025年8月29日公表とされる防火・避難関係規制見直しの内容と施行日
- 自治体例規システムのベンダ別 HTML 構造

---

## 17. Architecture Decision Records

**ADR-001** — 初期プロダクトは Legal Research Workspace とする。Compliance Decision Support は Product A の利用検証後に段階追加する。

**ADR-002** — MVP は Modular Monolith として実装し、運用上の独立性が必要になったモジュールだけを後から分離する。

**ADR-003** — PostgreSQL を業務データの System of Record とし、Search Index は再構築可能な Projection とする。

**ADR-004** — SourceVersion および EvidenceSnapshot は公開後に上書きしない。

**ADR-005** — Source / Provision / Norm / Rule を明確に分け、すべての法令文を Rule 化しない。MVP に Norm 層と Rule 層を実装しない。

**ADR-006** — Graph DB、Vector DB、Event Broker、Microservice、Multi-Agent は、計測された必要性が生じるまで導入しない。

**ADR-007** — AI は検索・整理・候補提示に限定し、適用時点・Jurisdiction・Authority は決定論的システムで制御する。AI Provider を Gateway の背後へ隔離し、AI 障害時も中核機能を継続する。

**ADR-008**（本書で新規） — 案件の適用時点を単一 `reference_date` ではなく複数の ApplicabilityAnchor で表現する。建築実務の適用時点が確認申請日・着工日・既存建物の建築時点に紐づくため。

**ADR-009**（本書で新規） — SourceVersion に `consolidation_state` を必須属性として持たせ、機械統合した編集現行版を Primary Citation にできない制約を DB・API の両層で強制する。

**ADR-010**（本書で新規、v1.1 改訂） — Reference Edge の型を MVP では 5 種に限定する。Norm 層を実装しない以上、規範関係の型は実装できない。版間の改正関係は Edge ではなく ProvisionVersion の有効期間連鎖で表現する。

**ADR-011**（本書で新規） — Citation Resolver を単一コンポーネントとして正本化し、検索・参照抽出・AI 引用検証の 3 者から共用する。

**ADR-012**（本書で新規） — 経過措置・既存不適格について、判定は行わず、関連規定の存在検知と導線提示のみを行う。

**ADR-013**（本書で新規） — 同一 Provision の有効期間重複を PostgreSQL の EXCLUDE 制約で禁止し、時点解決が曖昧な場合はエラーとする。推測による単一版の選択を行わない。

**ADR-014**（本書で新規） — Corpus Feasibility を User Research に先行させ、独立ゲートとする。結果がプロダクト定義を変えうるため。

**ADR-015**（本書で新規） — Rule DSL および専用 Runtime は、手動 Rule Candidate 検証（§15.7）の Gate 通過まで MVP の依存関係に含めない。

**ADR-016**（本書で新規） — 実装体制を Solo Track（実装 1 名＋AI 支援）とし、フェーズを §15.9 のとおり再構成する。ただし建築法令 Domain Reviewer を外部に有償で確保することを必須条件とし、実装者による兼任を禁じる。表示する条文の正確性は、実装者が AI を用いても自己検証できないためである。Domain Reviewer 未確保のまま S1 へ進まない。

**ADR-017**（本書で新規） — Solo Track において削減対象とするのは AI 機能、参照グラフ UI、差分表示の高度化、Review 専用画面、自治体例規の自動取込に限る。法令時間モデル、Consolidation State、Citation Anchor / Resolver、EvidenceSnapshot の不変性は削減対象から除外する。これらは後付けするとデータの作り直しになるためである。

**ADR-018**（本書で新規） — Solo Track では Pilot 規模（参加者数・組織数・検証件数）を縮小するが、正確性に関する成功条件（時点表示正確性 99%、Snapshot 再現成功率 90%、重大な Authority / Version 誤表示 0 件）は緩和しない。

**ADR-019**（v1.1 新規） — コーパスの時間的収録範囲（`coverage_from`）を第一級の概念とし、範囲外の日付指定には「収録範囲外」を正規の応答として返す。近い版を推測で表示しない。

**ADR-020**（v1.1 新規） — EvidenceSnapshot の不変性と個人情報の削除義務は墓標化方式で両立する。内容は削除済みマーカーへ置換し、ハッシュ・発行記録・監査は保持する。墓標化は専用経路のみで実行できる。

**ADR-021**（v1.1 新規） — 画面設計（§19）の中核決定: 長文閲覧画面の主スクロールは常に一つ。法令本文とその出典・時点表示を覆う UI を置かない。状態は色以外の手掛かりを併記する。参照関係はグラフ図ではなく読む順序として提示する。

**ADR-022** — 実装言語・スタックに TypeScript / Node 22 を採用する。詳細は [docs/adr/ADR-022-language-and-stack.md](adr/ADR-022-language-and-stack.md)。

**ADR-023**（S0 における事業判断） — 告示の溶け込み現行全文は提供せず、原文（案文）＋改正履歴の提示に留める（案B）。詳細は [docs/adr/ADR-023-notification-consolidation-policy.md](adr/ADR-023-notification-consolidation-policy.md)。

---

## 18. 実装順序の固定

```text
1. 対象コーパスの入手可能性を確かめる          ← ここで事業判断が変わりうる
2. 利用者課題と現行調査時間を測る
3. 限定コーパスを正確に構造化する
4. 時点検索と引用ナビゲーションを成立させる
5. 案件別に根拠を保存できるようにする
6. 第三者が再現できる Evidence Snapshot を作る
7. 補助的に AI を接続する
8. Pilot で価値を測定する
9. 実利用から Rule Candidate を抽出する
10. 必要性が証明された段階で Rule 形式化へ進む
```

**最重要原則**

> 本サービスは、法令を自動判定することで信頼を得るのではない。法令原文、適用時点、出典の確からしさ、参照関係、調査根拠を正確に扱うことで信頼を獲得する。

この原則に反する機能追加は、どれほど市場受けが良く見えても採用しない。誤った条文を自信を持って表示した瞬間に、このプロダクトの存在価値は失われる。

---

## 19. 画面設計

### 19.1 本章の位置付け

本章は Web Client の画面構成・遷移・状態・デザイントークン・フロントエンド依存関係を Normative に定める。

調査記録の第3章（スクロール型閲覧の認知研究）、第13章（UI詳細設計）、第14章（デザインシステム）を設計根拠とする。ただしそれらは「判断・論点・改正影響・AI」を含む全体構想向けの設計であるため、本章で Solo Track のスコープ（§15.8）へ再設計した。食い違う場合は本章が優先する。

本章に含めないもの（§15.8.2 の削減対象）:

- AI アシスト UI（Pilot では Feature Flag オフ。サポートペインのモード追加として将来拡張できる構造だけを §19.5 で確保する）
- Review 専用画面（ワークスペース内のステータスとコメントで代替）
- 参照グラフの可視化（一覧表示のみ）
- ダークモード（トークン経由で将来対応。§19.16）

### 19.2 UI 中核原則

ADR-021 の展開である。全画面に適用する。

1. **一画面一主スクロール** — 長文を読む画面の主スクロールは `document` スクロール一つだけ。本文の中に別の縦スクロール領域を作らない。モーダル内で法令全文を読ませない。例外は短い候補リスト・コマンドパレット・モバイルの一時的な下部シートのみで、長文閲覧は必ず主スクロールへ戻す。
2. **本文最優先** — 法令リーダーの中心は原文である。注釈・関連資料・案件情報は、本文を覆わず、本文の参照可能性を下げない位置に置く。
3. **状態を色だけで伝えない** — 現行/旧版、統合状態、確認状態、Anchor 移行状態、保存済み/未保存は、色に加えてラベル・アイコン・文言で区別する。
4. **関係は図ではなく読む順序** — 参照関係は「本文 → 委任先 → 例外 → 自治体追加」という縦の読む順序で提示する。ノード図を常時表示しない。
5. **現在地を失わせない** — 文書名・版・適用時点・条番号・遷移元を常に把握できる状態を保つ。
6. **重要操作は明示確定** — アンカー切替、Snapshot 発行、Publish、根拠の除外、墓標化は自動確定させない。下書き保存は自動でよい。

### 19.3 画面一覧

MVP の画面はこれで全部である。ここにない画面の追加は §15.6 の変更手続を要する。

| ID | 画面 | 目的 | 主要 API | フェーズ |
|---|---|---|---|---|
| SCR-00 | ログイン | Managed OIDC へのリダイレクト | OIDC | S1 |
| SCR-01 | ホーム | 検索起点・最近の案件・更新通知 | /search, /projects | S2 |
| SCR-02 | 検索結果 | 3 ルート検索の結果表示 | /search | S2 |
| SCR-03 | 法令リーダー | 条文閲覧・時点切替・参照ナビ・保存 | /provisions/* | S2 |
| SCR-04 | 案件一覧 | Project の一覧・作成 | /projects | S3 |
| SCR-05 | 案件ワークスペース | 調査課題・保存根拠・EvidenceSet・Review（統合単一画面） | /projects/*, /evidence-sets/* | S3 |
| SCR-06 | Snapshot 閲覧 | 発行済み根拠の読取専用表示・Export | /evidence-snapshots/* | S3 |
| SCR-10 | 取込ダッシュボード | IngestionJob の状況確認 | /admin/ingestion-jobs | S1（最小）→S2 |
| SCR-11 | Review Queue | 構造化・参照エッジ・DERIVED 昇格の人手確認 | /admin/review-queue | S2 |
| SCR-12 | SourceVersion 詳細 / Publish | Draft 版の確認と公開 | /admin/source-versions/* | S1 |
| SCR-13 | 監査ログ | 監査記録の検索・閲覧 | /admin/audit | S4 |
| SCR-14 | 手動登録 | 自治体例規の手動登録（§15.8.3） | /admin/sources | S3 |
| SCR-20 | 組織・メンバー管理 | 招待・ロール割当 | Identity | S1（最小） |
| SCR-21 | 個人設定 | 表示密度・本文サイズ | — | S3 |

### 19.4 レイアウト骨格

#### 19.4.1 デスクトップ（expanded ≧ 1200px）

```text
┌────────────────────────────────────────────────────────────────────┐
│ ロゴ   検索（⌘K）                    案件切替   通知   ユーザー    │ 56px
├────────────────────────────────────────────────────────────────────┤
│ 案件A ｜ 適用時点: 確認申請日 2026-10-01 ▾ ｜ ← 戻る: 検索結果    │ 40px ※案件文脈時のみ
├──────────────┬──────────────────────────────────┬──────────────────┤
│ Context Nav  │ Main（唯一の主スクロール）        │ Support Pane     │
│ 256px        │ 本文幅 640〜720px                 │ 320〜360px       │
│ sticky       │                                  │ sticky・排他1枚  │
└──────────────┴──────────────────────────────────┴──────────────────┘
```

- 本文の行長は日本語 35〜48 文字。ウルトラワイドでも本文列を広げない
- Context Nav は画面種別で内容が変わる（リーダー: 目次・保存済み位置・参照履歴 / ワークスペース: 調査課題一覧 / 管理: 管理メニュー）
- Support Pane は同時に 1 枚だけ開く

#### 19.4.2 medium（768〜1199px）

Support Pane を右端 48px のツールレールに畳む。ボタンで 1 枚ずつオーバーレイ展開し、展開中も本文の読み位置を保持する。

#### 19.4.3 compact（< 768px）

```text
┌──────────────────────┐
│ ← 建築基準法  ⌕  ⋮  │
│ 現行 2026-10-01・35条 │  ← 文脈バー（縮小固定）
├──────────────────────┤
│ 本文（主スクロール）  │
├──────────────────────┤
│ 目次   保存   注釈    │  ← 下部固定バー 56px
└──────────────────────┘
```

- Context Nav は全画面ドロワー、Support Pane は下部シートまたは独立画面
- 下部シート内に長文が発生する場合はシートでなく独立画面へ遷移する
- 横スワイプでの法令移動は採用しない

ブレークポイントは端末名でなく内容が破綻する幅で定義し、実装はコンテナクエリを優先する。

### 19.5 サポートペイン

モードは 3 つ。排他表示とする。

| モード | 内容 |
|---|---|
| 関連 | 現在条の Reference Edge を型ラベル付きで縦に列挙。順序: 委任先 → 定義 → 例外 → 参照 → 未確認の参照候補 → 未解決参照。「関連法令」という無ラベル見出しを使わない |
| 注釈 | 現在条に紐づく Annotation。出所（個人/案件）と AnchorStatus を常時表示 |
| 根拠 | 現在の案件・課題へ保存済みの SavedItem。各カードに条番号・版・適用時点・保存者 |

将来の AI モードはこのモード列への追加として実装する。ペイン構造自体の変更を要しない。

### 19.6 URL 設計

すべての主要状態を URL で再現可能にする。共有・レビュー・ブラウザ戻るがこの上に成立する。

```text
/login
/home
/search?q=&asOf=&authority=&law=&project=
/laws/{sourceId}                          … 現行版の目次へ
/laws/{sourceId}/provisions/{path}?asOf=&project=&anchorId=
/cite/{citationAnchor}?asOf=              … 恒久引用 URL（§6.1）。Resolver で解決しリーダーへ 302
/projects
/projects/{projectId}
/projects/{projectId}/questions/{questionId}
/snapshots/{snapshotId}                   … 権限付き読取専用
/admin/ingestion
/admin/review-queue
/admin/sources/{sourceId}/versions/{versionId}
/admin/manual-entry
/admin/audit
/settings/organization
/settings/profile
```

規則:

- `asOf` は常に URL に現れる。省略時は当日で解決し、リダイレクトで明示化する。時点が URL に出ない条文表示経路を作らない
- `project` は案件文脈の伝播に使う。付いている間は適用時点バー（§19.4.1）を表示する
- ブラウザ戻るで、検索条件・スクロール位置・展開状態を復元する
- スクロール位置の保存はピクセルでなく「条項 ID ＋条項内相対位置＋表示版」で行う。復帰時に同一版がなければ Anchor 移行状態（§6.2）を提示する

### 19.7 画面遷移

#### 19.7.1 遷移図

```text
SCR-00 ログイン
  └→ SCR-01 ホーム
       ├→ SCR-02 検索結果 ⇄ SCR-03 法令リーダー
       │                        │ ↺ 参照先条文（リーダー内遷移・履歴スタック）
       │                        └→ 保存パネル（オーバーレイ）
       └→ SCR-04 案件一覧 → SCR-05 ワークスペース
                                ├→ SCR-03（案件文脈付き）
                                ├→ Snapshot 発行（確認ダイアログ）→ SCR-06
                                └→ SCR-06 内 Export

管理:  SCR-10 取込 → SCR-11 Review Queue → SCR-12 版詳細/Publish
       SCR-14 手動登録 →（Segmenter 以降の共通フロー）→ SCR-11 → SCR-12
       SCR-13 監査
```

#### 19.7.2 文脈保持規則

| 遷移 | 引き継ぐもの | 戻る時に復元するもの |
|---|---|---|
| SCR-02 → 03 | asOf、project、検索クエリ | 検索条件・結果スクロール位置・展開状態 |
| SCR-03 内の参照遷移 | asOf、project。履歴スタックへ push | 復帰チップ「← 第35条第1項へ戻る」で元条文・元位置 |
| SCR-05 → 03 | project、active アンカーの日付を asOf へ | 選択中の調査課題 |
| SCR-03 → 05（保存後） | 保存先課題を選択済み状態で開く導線（遷移は任意） | — |
| SCR-06 → 03 | asOf を Snapshot の anchor_date に**固定** | — |

SCR-06 から開いたリーダーには「Snapshot #12 の時点（2026-04-01）に固定して表示中」の固定バナーを出し、時点切替 UI を無効化する。

#### 19.7.3 リーダー内履歴スタック

参照先へ遷移するたびに（条項 ID・版・スクロール位置）を push する。復帰チップは直前 1 件を常時表示し、それ以前はブラウザ戻ると目次から辿る。移動先の条文は数秒間輪郭を強調する。長距離移動にスクロールアニメーションを使わない。

### 19.8 SCR-01 ホーム

構成（上から）: 全体検索フィールド（大） → 最近の案件（最大 5 件、active アンカー日付つき） → コーパス更新通知（保存済み条文に影響する改正があれば優先表示） → 空状態時はオンボーディング導線。

検索フィールドは `/` または `⌘K` で全画面から呼び出せるコマンドパレットと同一実装とする。

### 19.9 SCR-02 検索結果

#### 結果の 3 系統（§9.1 に対応）

引用指定が解決できた場合、最上部に別枠で表示する。

```text
┌ 条文指定 ─────────────────────────────────┐
│ 建築基準法 第35条 → 開く（2026-10-01 時点） │
└──────────────────────────────────────────┘
```

#### 結果カードの構成

```text
建築基準法 第35条（特殊建築物等の避難及び消火に関する技術的基準）
…排煙設備、非常用の照明装置及び進入口並びに敷地内の…（一致箇所を強調）
[法律] [現行: 2025-04-01〜] [官報確認済]     一致: 見出し・本文
```

必須要素: 法令名 / 条項ラベル / 抜粋（ハイライト付き）/ AuthorityBadge / 有効期間 / ConsolidationBadge（編集現行版のみ表示）/ 一致理由。

結果一覧の上部に「検索順位は確実性を意味しません」を常設表示する（§9.4）。ゼロ件時は §19.15 の文言に従い、引用指定・別表記の提案を出す。無限スクロールは使わずページングとする。

### 19.10 SCR-03 法令リーダー（中核画面）

#### 19.10.1 本文ヘッダー

```text
建築基準法（昭和25年法律第201号）
表示時点: 2026-10-01（確認申請日アンカー）｜ 版: 2025-04-01 施行 ｜ [法律] [官報確認済]
出典: e-Gov 法令検索（2026-07-28 取得）→ 原本を開く ｜ 版履歴 ｜ 差分
```

案件文脈がない場合も「表示時点: 現行（2026-07-29）」を必ず表示する。時点の見えない条文表示を作らない（原則5）。

#### 19.10.2 条ブロック

条を認知上の「ページ単位」として扱う。

- 条番号＋見出しを強い見出しとし、条の前に大きな余白（space.16）
- 項・号の字下げを一貫させ、号は行頭記号で階層を示す
- 条の終端は弱い罫線
- スクロール中は現在条の条番号を sticky 表示（「第112条 第3項付近」）
- 各条・項に恒久リンクコピーのアイコン（hover / focus 時のみ表示）

#### 19.10.3 帯（NoticeBand）

条ブロックの直上に、該当時のみ表示する。複数該当時はこの順で縦に積む。

1. **整合性エラー**（critical）: 「時点解決に失敗しました。この条文は表示できません。運用へ自動通報済みです」— 本文を表示しない（§4.2）
2. **収録範囲外**（§4.6・§19.15 の文言）— 本文を表示しない
3. **編集現行版**（caution）: 「この本文はサービスが機械統合した編集現行版です（人手確認済）→ 官報原文」
4. **未施行改正あり**（info・折畳み）: 「未施行の改正があります（2027-04-01 施行予定）→ 新旧を比較」
5. **経過措置あり**（info）: §4.5 の文言
6. **Snapshot 固定表示中**（info・固定）: §19.7.2

#### 19.10.4 本文中の参照

Reference Edge が解決済みの参照語句は下線リンクとし、hover / focus で参照先の冒頭をプレビュー、クリックでリーダー内遷移（履歴スタック push）。未確認候補は点線下線＋「未確認」ツールチップ。未解決参照は下線なし＋サポートペイン「関連」の未解決セクションに列挙する。

#### 19.10.5 テキスト選択 → アクション

本文選択時にポップオーバーを表示する: 「案件へ保存」「注釈を付ける」「引用リンクをコピー」。コピーされるのは `/cite/{anchor}?asOf=` の恒久 URL。

#### 19.10.6 保存パネル

「案件へ保存」で右からオーバーレイパネルを開く（本文の読み位置は保持）。

```text
保存先:   案件A ▾ ／ 課題「居室の排煙」▾（新規作成可）
固定される情報:
  条文     建築基準法 第35条
  版       2025-04-01 施行版（官報確認済）
  適用時点 確認申請日 2026-10-01
メモ（任意）: ______
              [この版で保存]
```

固定される版と時点を保存前に必ず見せる（§10.2）。保存後トーストに「課題を開く」導線を付ける。

#### 19.10.7 版履歴・差分

版履歴はリーダー内のサイド表示で時系列に列挙（公布日と施行日を区別）。差分は「公式新旧対照表へのリンク」を優先し、機械差分はインライン表示＋「機械比較」ラベル（§4.4、Solo Track では高度化しない）。

#### 19.10.8 スクロール仕様

- 主スクロールは `document`。URL アンカー・ブラウザ戻るとの整合を優先する
- 目次は Intersection Observer で現在条に追従。条境界での選択のばたつきを判定余白で抑制する
- アンカー遷移時は固定ヘッダー分のオフセットを確保する
- 位置保存は §19.6 の規則（条項 ID ベース）
- 法令本文に無限スクロールを採用しない。長大な法令は編・章単位の遅延ロードとし、目次からの遷移を保証する

### 19.11 SCR-04 案件一覧 / SCR-05 案件ワークスペース

#### SCR-04 案件一覧

テーブル表示: 案件名 / Jurisdiction / active アンカー（種別＋日付）/ 課題数 / 状態 / 最終更新。作成時の必須入力は名称・Jurisdiction・最初のアンカー（種別と日付）。

#### SCR-05 ワークスペース（Project ＋ EvidenceSet 統合画面）

```text
┌────────────────────────────────────────────────────────────────────┐
│ 案件A ｜ 横浜市 ｜ アンカー: 確認申請日 2026-10-01 ▾ ＋追加        │
├──────────────┬─────────────────────────────────────────────────────┤
│ 調査課題      │ 課題「居室の排煙根拠」        状態: DRAFT           │
│ ● 排煙       │ ┌ 調査要約（人が書く）────────────────────┐        │
│ ○ 竪穴区画   │ └─────────────────────────────────────────┘        │
│ ○ 接道       │ Primary Citations                                   │
│              │  [法35条｜2025-04-01版｜官報確認済｜開く]           │
│ ＋課題を追加  │  [令126条の2｜…]                                   │
│              │ 参考資料 (1) ／ 注釈 (3) ／ 未解決事項 (1)          │
│              │ ─────────────────────────────────────────           │
│              │ レビュー: 未依頼  [レビューへ提出]                  │
│              │ [Snapshot を発行…]                                  │
└──────────────┴─────────────────────────────────────────────────────┘
```

- 左が課題一覧（Context Nav）、右が選択中課題の詳細。Review は課題詳細内のステータス＋コメントスレッドで完結する（専用画面なし）
- 要約と Citation を視覚的に分離し、Citation ゼロのまま要約だけがある状態には警告を出す（§10.3）
- Citation なしで「レビューへ提出」はできない

**アンカー切替（原則6）**: 切替はダイアログで確定する。「保存済みの根拠 4 件は『確認申請日 2026-10-01』時点で保存されています。アンカーを切り替えても保存内容は変わりません。表示だけが新しい時点になります」— 確定後、表示中の条文が変わる場合は差分導線を出す（§4.3）。

**Snapshot 発行（原則6）**: 確認ダイアログに「発行後は変更できません。固定される版: …（一覧）」を表示し、発行後は SCR-06 へ遷移する。

**過去調査の再利用**: 課題検索から類似課題を開くとき、当時のアンカーと現在の差を先頭に表示する（§10.6）。

### 19.12 SCR-06 Snapshot 閲覧・Export

- 読取専用。編集 UI を一切置かない
- 構成: SnapshotHeader（番号・ハッシュ・発行者・発行日時・適用時点・REVIEWED は法的承認でない旨の免責）→ 調査課題 → 要約 → Primary Citations（本文抜粋＋出典メタデータ）→ 注釈 → 未解決事項 → レビュー所見
- 各 Citation から `/cite/` 恒久 URL でリーダーへ遷移できる（時点固定。§19.7.2）
- Export は Markdown / PDF。出力物に Source Metadata・適用時点・生成日時・免責文言を必ず含める（§10.5）
- 墓標化済み Snapshot は内容の代わりに「この Snapshot の内容は YYYY-MM-DD に削除されました」を表示する（§10.4）

### 19.13 管理画面（SCR-10〜14）

管理画面は Corpus Editor / System Admin 専用。利用者画面とレイアウトを共有するが、ヘッダー配色を変えて誤認を防ぐ。

- **SCR-10 取込ダッシュボード**: ジョブ一覧（状態・SourceType・所要時間・失敗理由）。失敗は §19.15 のエラー書式で表示
- **SCR-11 Review Queue**: 3 種のキューをタブで分ける — 構造化確認（Segmenter の警告）/ 参照エッジ確認（§7.3）/ DERIVED 昇格（§5.4）。各項目は原文と抽出結果を左右比較で表示し、承認・修正・差戻しを記録する
- **SCR-12 SourceVersion 詳細**: メタデータ・consolidation_state・verification_status・Validation 結果・差分を確認して Publish する。Publish は確定ダイアログ＋監査記録（原則6）。`DERIVED_CONSOLIDATED` は HUMAN_REVIEWED 未満なら Publish ボタンが無効（§5.4）
- **SCR-13 監査ログ**: 期間・Actor・Action・Resource で絞り込み。本文は出さずハッシュ参照（§12.4）
- **SCR-14 手動登録**: 自治体例規用。メタデータフォーム（canonical URI・公開主体・authority_class・consolidation_state・取得日時は必須）→ 本文貼付け → 条/項/号の行頭マーキング → セグメント化プレビュー → Draft SourceVersion 作成。以降は通常の Review → Publish フローに合流する。取込の入口が違うだけで、公開の関門は同一とする（§15.8.3）

### 19.14 状態設計の共通規約

すべての画面は次の状態を設計・実装する: 標準 / 空 / 読込中 / 部分失敗 / 全体失敗 / 権限不足。

- **読込中**: 300ms 以内に完了する操作にスケルトンを出さない。それ以上はレイアウトを保ったスケルトン
- **部分失敗**: 本文が出せて関連が出せない場合、本文を表示し関連側にだけエラーを出す。全画面エラーで本文まで隠さない
- **権限不足**: 機能は見せて理由を示す（「Publish は Corpus Editor のみ実行できます」）。ただしアクセス権のない案件名・件数の存在推測ができる表示はしない
- **オフライン/API 断**: 読取専用バナーを出し、編集操作を無効化する。入力中データはローカルに保持し復帰時に再送を促す
- **StatusBanner の書式**: 「何が起きたか / 影響 / 次にできる操作」の 3 要素を必ず含む。重大度は info / caution / critical

### 19.15 空状態・エラーの文言定義

| 状況 | 文言（要旨） | 導線 |
|---|---|---|
| 検索ゼロ件 | 「一致する条文がありません。条番号指定（例: 法35条）や別の表記もお試しください」 | 表記揺れ候補・引用指定例 |
| 収録範囲外（§4.6） | 「指定された日付（1975-06-01）の条文は本サービスの収録範囲外です。収録している最古の版は 2017-06-01 施行版です」 | 「最古の収録版を開く（指定日と異なります）」— 明示クリックのみ。開いた画面に常時警告 |
| 時点解決エラー（§4.2） | 「時点解決に失敗しました。この条文は表示できません。運用へ通報済みです」 | 他の版の履歴一覧 |
| 未収録法令への参照 | 「参照先（消防法）は本サービスに未収録です」 | e-Gov への外部リンク（外部であることを明示） |
| Anchor 移行要確認（§6.2） | 「元の条文が改正されました。注釈の位置を確認してください」 | 旧版本文の並列表示 |
| 案件ゼロ件 | 「まだ案件がありません。案件を作ると、調査した条文を根拠として保存できます」 | 案件作成 |
| 墓標化 Snapshot | 「この Snapshot の内容は 2026-09-01 に削除されました。発行記録と検証用ハッシュは保持されています」 | — |

すべての法令表示画面のフッターに「本サービスは法令適合の判定を行いません。最終判断は原文と所管行政庁の確認によってください」を常設する。

### 19.16 デザイントークン

#### 19.16.1 方針

- 命名は `category.role.variant.state`。Semantic Token に具体色名を含めない
- 法令本文の書体はゴシック（Hiragino Sans / Noto Sans JP 系）を標準とする。明朝は将来の個人設定オプションとし、MVP では検証コストを負わない
- ダークモードは実装しないが、全色を CSS Custom Properties 経由で参照し、値の差替えだけで対応できる構造にする
- 過剰なカード化を避ける。本文のまとまりは余白と細い罫線で示し、影は浮遊要素（ポップオーバー・ダイアログ）に限定する

#### 19.16.2 初期値

以下は初期値であり、WCAG 2.2 AA のコントラスト検証を通過することを受入条件とする（§19.21）。

```css
:root {
  /* 基盤 */
  --color-bg-canvas: #FAFAF8;
  --color-surface-default: #FFFFFF;
  --color-surface-subtle: #F4F4F1;
  --color-text-primary: #1C1C21;
  --color-text-secondary: #55555E;
  --color-text-muted: #7A7A84;
  --color-border-default: #DDDDD8;
  --color-border-strong: #B9B9B2;
  --color-link: #2952CC;
  --color-focus: #2952CC;

  /* 意味カテゴリ（§19.2-3: 色は常にラベルと併用） */
  --color-info-surface: #EDF2FE;     --color-info-text: #24479F;
  --color-positive-surface: #E8F5EC; --color-positive-text: #1E6B38;
  --color-caution-surface: #FDF3DC;  --color-caution-text: #7A5200;
  --color-critical-surface: #FCEBEA; --color-critical-text: #A3261E;
  --color-archived-surface: #EFEFED; --color-archived-text: #64646C;

  /* 注釈・選択 */
  --color-selection: #FFF1B8;
  --color-annotation-marker: #F5D76E;

  /* タイポグラフィ */
  --font-family-sans: "Hiragino Sans", "Noto Sans JP", sans-serif;
  --font-family-mono: ui-monospace, "SF Mono", monospace;
  --font-size-body: 16px;          /* 法令本文の下限。これ未満を標準にしない */
  --line-height-reading: 1.9;      /* 法令本文 */
  --line-height-default: 1.6;

  /* レイアウト */
  --layout-header-height: 56px;
  --layout-anchor-bar-height: 40px;
  --layout-context-nav-width: 256px;
  --layout-support-pane-width: 336px;
  --reader-max-width: 45rem;       /* 720px ≒ 日本語 42 字 */

  /* 余白: 4px スケール */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  /* z-index */
  --z-sticky: 100; --z-popover: 200; --z-pane: 300;
  --z-backdrop: 400; --z-modal: 500; --z-toast: 600;
}
```

- 条番号・告示番号・日付には等幅数字（`font-variant-numeric: tabular-nums`）を使う。本文全体は等幅にしない
- 表示密度（コンパクト/標準/ゆったり）は個人設定として保存し、内容を変えない
- モーションは 150〜250ms に限定し、`prefers-reduced-motion` で無効化する

### 19.17 コンポーネント一覧

#### Primitive（ドメイン非依存）

Button（primary / secondary / danger）・Link・IconButton・TextField・TextArea・Select・Checkbox・Badge・Divider・Dialog・Drawer/Sheet・Toast・Skeleton・Tabs・Popover。

規則: focus outline を消さない。disabled と read-only を区別する。破壊的操作の Button は danger のみ。

#### Domain（建築法令ドメイン）

| コンポーネント | 責務 | 対応節 |
|---|---|---|
| ProvisionBlock | 条ブロックの表示（見出し・項号階層・終端罫線・恒久リンク） | §19.10.2 |
| ArticleStickyHeader | 現在条の追従表示 | §19.10.2 |
| TocTree | 目次とスクロール同期 | §19.10.8 |
| AuthorityBadge | Authority Class 表示（§5.2 軸1） | §5 |
| ConsolidationBadge | 統合状態表示。DERIVED は警告様式＋原本導線必須（§5.3-3,4） | §5 |
| VerificationBadge | 確認状態表示（§5.2 軸3） | §5 |
| ValidityLabel | 有効期間・未施行・失効の表示 | §4 |
| ApplicabilityBar | 適用時点バー（種別・日付・切替） | §4.3 |
| NoticeBand | 帯（整合性エラー/収録範囲外/編集現行版/未施行/経過措置/固定表示） | §19.10.3 |
| ReferenceList | 型ラベル付き参照一覧（確認済/未確認/未解決の 3 群） | §7.3 |
| SearchResultCard | 検索結果カード | §19.9 |
| CitationCard | 保存済み引用の表示（条番号・版・時点・出典） | §10.2 |
| AnnotationMarker / AnnotationCard | 注釈（AnchorStatus 3 態の表示を含む） | §6.2 |
| SaveFlowPanel | 保存パネル（固定情報の提示と確定） | §19.10.6 |
| SnapshotHeader | Snapshot メタデータと免責 | §19.12 |
| ReviewStatusChip | DRAFT〜ARCHIVED の状態表示 | §10.4 |
| DiffView | 機械差分（「機械比較」ラベル必須） | §4.4 |
| BackChip | リーダー内復帰チップ | §19.7.3 |
| StatusBanner | 3 要素書式のバナー | §19.14 |

Domain コンポーネントは表示に徹し、API を直接呼ばない。バッジ類（Authority / Consolidation / Verification / Validity）は必須 props とし、未指定でレンダリングできない型定義にする。「バッジのない表示経路を作らない」（§5.3-3）をコンパイル時に強制するためである。

#### Pattern

AppShell・ReaderLayout・WorkspaceLayout・AdminLayout・SnapshotLayout。

### 19.18 フロントエンド構造と依存関係

#### 19.18.1 層と依存方向

```text
tokens
  └→ components/primitives
        └→ components/domain
              └→ features（reader / search / workspace / evidence / admin / auth）
                    └→ routes
                          └→ app（shell / providers）

services/api（OpenAPI 生成クライアント）→ features のみが利用
telemetry → shell と features から利用
```

- 下層から上層への import を lint で禁止する
- features 間の直接依存を禁止する。共有が必要なら domain コンポーネントまたは services へ降ろす

#### 19.18.2 ディレクトリ

```text
src/
├ app/            # shell, providers, routes
├ features/
│  ├ search/
│  ├ reader/
│  ├ workspace/   # project + evidence + review
│  ├ snapshot/
│  ├ admin/
│  └ auth/
├ components/
│  ├ primitives/
│  └ domain/
├ tokens/
├ services/       # API クライアント・認証
├ telemetry/
└ test/
```

#### 19.18.3 feature と API の対応

| feature | 主要 API | 実装フェーズ |
|---|---|---|
| auth | OIDC / me | S1 |
| admin | /admin/*（Publish は S1、Queue は S2、手動登録は S3） | S1〜S3 |
| reader | /provisions/{id}/at・history・references・diff、/cite | S2 |
| search | /search | S2 |
| workspace | /projects/*、saved-items、annotations、evidence-sets | S3 |
| snapshot | /evidence-snapshots/* | S3 |

#### 19.18.4 データ取得と状態

- サーバ状態はクエリキャッシュ（stale-while-revalidate）で管理し、UI 状態と分離する
- 公開済み ProvisionVersion は不変（§ADR-004）のため長期キャッシュ可能。検索結果・案件データは短期キャッシュ＋再検証
- 楽観的更新は注釈・メモ等の低リスク操作に限定し、Snapshot 発行・Publish・アンカー切替には使わない（原則6）
- 下書きは自動保存し、保存状態（保存済み/保存中/失敗）を常時表示する

### 19.19 アクセシビリティとキーボード

- ランドマーク: header / nav（目次）/ main（本文）/ complementary(サポートペイン) / footer
- 法令の構造を見出しレベルへ対応させる（法令名 h1 / 章 h2 / 条 h3）。スキップリンク「本文へ移動」を先頭に置く
- キーボード: `⌘K`/`Ctrl+K` 検索、`Esc` 閉じる、Tab 順は視覚順。ダイアログはフォーカストラップと復帰。保存パネル・ポップオーバーもキーボードのみで完結できること
- ターゲットサイズは最小 24×24px、モバイル下部バーは 44px
- 200% 拡大でも情報と機能を失わない（リフロー）。文字サイズ変更は本文のみ拡大できる個人設定を併設する
- 選択・注釈マーカーはコントラストを個別検証する。ライブリージョンはトースト・保存状態・検索結果件数に限定する

### 19.20 計測イベント

§14.4 の指標算出に必要な最小セット。個人評価・監視に転用しない。

```text
search_submitted{route: citation|keyword}     … 到達時間計測の起点
search_zero_result
provision_viewed{asOf, authority, consolidation}
reference_followed{edge_type, review_status}
unresolved_reference_shown
save_completed{elapsed_from_search}           … North Star の分子
annotation_created
anchor_switched{from_kind, to_kind}
snapshot_published
snapshot_opened{by_third_party: bool}         … 再現成功率の分母
export_generated{format}
coverage_out_of_range_shown                   … ガードレール
integrity_error_shown                         … ガードレール（0 目標）
stale_annotation_shown{anchor_status}
```

### 19.21 画面受入基準

各画面の Definition of Done に次を追補する。

1. §19.14 の 6 状態＋該当する場合は収録範囲外・旧版警告・墓標化の各状態が実装されている
2. compact / medium / expanded の 3 幅と 200% 拡大で破綻しない
3. キーボードのみで主要フローを完結できる
4. 本文・バッジ・フォーカス・選択範囲が WCAG 2.2 AA コントラストを満たす（測定値を記録）
5. 主スクロールが一つであること（開発者レビューでの確認項目）
6. URL から状態を再現できる。ブラウザ戻るで §19.7.2 の復元が動く
7. すべての条文表示経路に時点表示と出典バッジがある（§5.3-3 の監査）
8. §19.20 の該当イベントが発火する

---
