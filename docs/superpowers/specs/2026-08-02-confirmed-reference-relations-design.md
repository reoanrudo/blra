# 確認済み関連条文の分離・表示設計

- 日付: 2026-08-02
- 対象: `web/`（hourei-rag 起点の Next.js 14 + Prisma 法令リーダー）
- 状態: 対話承認済み、文書レビュー待ち
- 正本DB: `hourei_rag`（PostgreSQL + Prisma）
- 関連: `docs/design-spec.md` v1.3 §1.5、§7、`docs/HANDOFF.md`

## 1. 目的

Phase 1 の全文法令リーダーに、法令本文には書かれていないが実務上あわせて読むべき条文を表示できるようにする。ただし、機械が推定した候補と人が確認した関係をデータモデルと読取経路の両方で分離し、未確認候補が利用者向け画面へ出る可能性を構造的に排除する。

本文に明記された引用は既存の `Link` として扱い、本文外の実務上の関連とは混ぜない。法令本文、本文中の引用、運営が確認した実務上の関連を、利用者が区別できる状態を保つ。

## 2. 現状と制約

### 2.1 既存 `Link`

現在の `Link` は `web/scripts/ingest.ts` が法令本文から規則ベースで抽出する派生データである。取込再実行時に `Link` 全件を削除して再生成するため、人手確認結果の保存先にはできない。

全文APIは、次の条件をすべて満たす `Link` だけを本文ペイロードへ含めている。

- `isResolved = true`
- 参照元と参照先が soft delete されていない
- 参照元と参照先が現在の法令集収録範囲内にある
- 参照先 `Article` が存在する

この契約は維持する。閲覧時に正規表現やAIで新しい本文リンクを追加しない。

### 2.2 Phase 1 の画面制約

- 読者画面は「左: 目次・検索」「中央: 本文」の2列を維持する
- 常設右パネル、実務パネル、編集機能を読者画面へ戻さない
- 検索結果と参照先は比較用の新しいタブで開く
- 補助情報の失敗で法令本文を隠さない
- 未確認候補を利用者向けAPI・HTML・全文ペイロードへ含めない

### 2.3 版との関係

現行の `Article` は `LawRevision` に所属する版固有ノードである。確認済み関係も特定版の `Article` 同士を結ぶ。新しい法令版へ自動移行せず、改訂後は新しい版の組合せとして再確認する。近い条文への自動付替えは行わない。

URLの恒久性や版をまたぐ条文同一性は、`docs/HANDOFF.md` の後続タスク「URLの永続性」で扱う。本実装のついでに恒久IDモデルを導入しない。

## 3. 採用判断

### 3.1 不採用: 既存 `Link` の拡張

`Link` に確認状態を追加すると、取込再実行時の全件再生成で確認履歴が失われる。また、本文に実在する引用と本文外の実務上の関連が同じ責務へ混在するため不採用とする。

### 3.2 不採用: 1テーブル内の公開状態切替

候補と確認済み関係を1テーブルへ保存し、`status` だけで公開を制御する方式は、公開クエリの条件漏れによって未確認候補が出る余地を残す。法令リーダーの信頼境界として弱いため不採用とする。

### 3.3 採用: 候補と確認済み関係の物理分離

機械候補を `RelatedArticleCandidate`、人が確認して利用者へ公開できる関係を `ConfirmedArticleRelation` に保存する。公開APIは `ConfirmedArticleRelation` だけを参照し、候補テーブルへの依存を持たない。

承認は候補の状態を公開へ切り替える操作ではない。トランザクション内で確認済み関係を新規作成し、元候補を昇格済みに記録する操作とする。

## 4. データモデル

### 4.1 共通の関係種別

`docs/design-spec.md` §7.2 と同じ5種に限定する。

| 値 | 読者表示 | 用途 |
|---|---|---|
| `DELEGATES_TO` | 委任先 | 法律から政令・省令・告示等への委任 |
| `APPLIES_MUTATIS_MUTANDIS` | 準用 | 読替えを含み得る準用 |
| `DEFINES` | 定義 | あわせて確認すべき用語定義 |
| `EXCEPTS` | 例外 | ただし書き、適用除外、例外規定 |
| `CITES` | 参照 | 上記に分類しない確認済み関連 |

規範関係を自動判定する新しい種別は追加しない。準用について、読替え後本文は生成しない。

### 4.2 `RelatedArticleCandidate`

機械処理が提案した未公開データを保持する。

```text
id                         String (PK)
sourceArticleId            String (FK Article, required)
proposedTargetArticleId    String? (FK Article)
proposedTargetText         String?
relationType               RelationEdgeType
extractionMethod           RULE_BASED | LLM_ASSISTED
generatorVersion           String
confidence                 Float
rationale                  String?
candidateFingerprint       String (unique)
status                     PENDING | REJECTED | PROMOTED
reviewedById               String? (FK User)
reviewedAt                 DateTime?
reviewNote                 String?
createdAt                  DateTime
updatedAt                  DateTime
```

規約:

- `sourceArticleId` は必須とする
- `proposedTargetArticleId` と `proposedTargetText` の少なくとも一方を必須とする
- `confidence` は `0.0` 以上 `1.0` 以下とする
- `generatorVersion` は候補生成規則またはプロンプトの版を必須で記録する
- `candidateFingerprint` は、生成手法、参照元、提案先、関係種別、`generatorVersion` から決定論的に作り、再実行時の重複を防ぐ
- `PENDING` の候補はレビュー情報を持たない
- `REJECTED` と `PROMOTED` は、確認者、確認日時、レビュー記録を持つ
- 候補の削除を通常操作にしない。再生成しても既存の棄却判断を復活させない
- Phase 1 の公開API、全文API、Server Component、クライアント状態へこのモデルを渡さない

### 4.3 `ConfirmedArticleRelation`

人が確認し、読者へ表示できる関係を保持する。

```text
id                   String (PK)
sourceArticleId      String (FK Article, required)
targetArticleId      String (FK Article, required)
relationType         RelationEdgeType
rationale            String (required)
origin               MANUAL | CANDIDATE
sourceCandidateId    String? (unique, FK RelatedArticleCandidate)
confirmedById        String (FK User, required)
confirmedAt          DateTime (required)
revokedAt            DateTime?
revokedById          String? (FK User)
revocationReason     String?
createdAt            DateTime
updatedAt            DateTime
```

規約:

- 参照元と参照先は、Phase 1 では `Article.level = article` に限定する
- 参照元と参照先は異なるノードでなければならない
- `origin = CANDIDATE` の場合は `sourceCandidateId` を必須とする
- `origin = MANUAL` の場合は `sourceCandidateId` を持たない
- `confirmedById`、`confirmedAt`、前後の空白を除いて1〜500文字の `rationale` がない関係は作成できない
- 同じ参照元、参照先、関係種別の有効な関係は1件に限定する
- 取消時は物理削除せず、取消者、取消日時、理由を記録する
- 再確認時は新しい確認記録を作り、過去の取消記録を残す
- 公開クエリは常に `revokedAt IS NULL` を条件にする

Prismaだけでは表現できない条件は、ドメインサービスのSerializableトランザクション内で検証する。DBマイグレーションのベースライン化後、必要な部分ユニーク制約とCHECK制約をSQLへ昇格する。

### 4.4 既存モデルとの関係

- `Article` に候補・確認済み関係の参照元／参照先リレーションを追加する
- `User` にレビュー、確認、取消のリレーションを追加する
- `Link`、`LawRevision`、`LawBookEntry` の既存列や責務は変更しない
- `web/scripts/ingest.ts` の `Link` 再構築は、新しい2テーブルを削除・更新しない

## 5. 確認ワークフロー

### 5.1 候補生成

候補生成処理は `RelatedArticleCandidate` へだけ書き込む。Phase 1 の初回実装では、将来のルール抽出・AI抽出が利用できるスキーマと保存サービスを用意するが、新しい自動候補生成器は実装しない。

### 5.2 承認

承認サービスは1トランザクションで次を行う。

1. 候補が `PENDING` であることを確認する
2. 確定後の参照元、参照先、関係種別、根拠を検証する
3. 両Articleが現行法令集の収録範囲内で、soft deleteされていないことを確認する
4. `ConfirmedArticleRelation` を作成する
5. 候補を `PROMOTED` にし、確認者、確認日時、レビュー記録を保存する

候補から参照先や関係種別を修正して承認できる。元の提案は候補側へ残し、確定内容は確認済み関係側へ保存する。

### 5.3 棄却

棄却は候補を `REJECTED` にし、確認者、確認日時、理由を保存する。棄却候補から確認済み関係を作らない。

### 5.4 手動登録

人が機械候補を経ずに関係を登録する場合は、同じ検証を通して `origin = MANUAL` の確認済み関係を作成する。実装者がテストやデモのために実在関係を推測して投入してはならない。初回実装では実DBへ確認済み関係を自動投入せず、テストfixtureだけを使用する。

### 5.5 取消

誤りや版変更を発見した場合は確認済み関係を取消状態にする。取消後は公開APIから即座に除外する。物理削除はしない。

## 6. 公開読取API

新規エンドポイント:

```text
GET /api/law-revisions/{lawRevisionId}/confirmed-relations
```

応答の概形:

```typescript
interface ConfirmedRelationsDocument {
  revisionId: string;
  relationsBySource: Record<string, ConfirmedRelation[]>;
}

interface ConfirmedRelation {
  id: string;
  relationType:
    | "DELEGATES_TO"
    | "APPLIES_MUTATIS_MUTANDIS"
    | "DEFINES"
    | "EXCEPTS"
    | "CITES";
  rationale: string;
  confirmedAt: string;
  target: {
    articleId: string;
    lawName: string;
    lawShortName: string | null;
    articleNumber: string | null;
    caption: string | null;
  };
}
```

公開条件:

- 参照元がリクエストされた `LawRevision` に属する
- 確認済み関係が取り消されていない
- 参照元と参照先が soft delete されていない
- 参照元と参照先が現在の法令集収録範囲内にある
- 参照先が存在し、固定アンカーで開ける

候補ID、信頼度、抽出方法、レビュー担当者の個人情報は公開応答へ含めない。利用者には個人名ではなく「運営確認済み」と表示する。

応答は参照元Article IDでグループ化し、全文読込後のスクロールや同一法令内移動で追加取得しない。`ETag` と `Cache-Control: public, max-age=60, stale-while-revalidate=300` を付ける。関係の更新が大きな全文JSONのETagを変更しない構造にする。

## 7. 読者画面

### 7.1 表示位置

確認済み関係が存在する条ブロックの直後に、初期状態を閉じた開閉要素を置く。

```text
第2条　（用語の定義）
  本文……

  ▸ 確認済みの関連 2件
```

関係が0件の場合は要素を描画しない。常設右パネルや新しい左タブは追加しない。

### 7.2 展開内容

展開時は関係を縦に並べ、各項目に次を表示する。

- 関係種別の日本語ラベル
- 参照先の法令名、条番号、公式見出し
- 人が確認した短い根拠
- 「運営確認済み」のテキストラベル

参照先は `/articles/{targetArticleId}` を新しいタブで開き、`target="_blank"` と `rel="noopener noreferrer"` を付ける。本文中の引用リンクとは別のコンポーネントとスタイルを使い、法令原文の一部に見せない。

### 7.3 並び順

関係種別は次の順で表示する。

1. `DELEGATES_TO`
2. `APPLIES_MUTATIS_MUTANDIS`
3. `DEFINES`
4. `EXCEPTS`
5. `CITES`

同じ種別内では、参照先法令の法令集表示順、条文順、確認日時の昇順、関係IDの昇順で安定ソートする。

### 7.4 取得失敗

関連APIは全文APIと独立して取得する。関連APIだけが失敗した場合は本文と目次を表示し続け、本文上部に「確認済みの関連を取得できませんでした。法令本文は表示できます」という部分失敗通知と再試行操作を出す。

候補データを代替表示したり、既存 `Link` から実務上の関連を推測して埋めたりしない。

## 8. 内部投入とレビュー範囲

初回実装には次を含める。

- Prismaモデルとドメイン型
- 候補の保存、承認、棄却、手動登録、取消を行うサーバー側サービス
- 確認済み関係の公開読取API
- 確認済み関係の読者表示
- テスト用fixtureによる全経路の検証

初回実装には次を含めない。

- AI・ルールによる候補生成器
- 利用者向け編集機能
- 完成版のReview Queue画面
- ロール・認証基盤の拡張
- 実在する関連条文の自動seed
- 版をまたぐ関係の自動移行
- 既存 `src/` の `reference_edge` とのDB統合

管理用の公開ミューテーションAPIは、認証・権限設計が揃うまで作らない。初回はサーバー内部サービスとして境界を固定し、将来のReview Queueから同じサービスを呼ぶ。

## 9. DB適用方針

現在の `hourei_rag` DBは過去の `prisma db push` で構築され、既存migration履歴と整合していない。本実装では次を守る。

- `prisma migrate deploy` を実行しない
- 既存テーブルやデータを削除・変更しない
- Prisma schemaへ新しいenum、2テーブル、リレーションを追加する
- ローカルDBへの適用は、差分が追加操作だけであることを確認してから `prisma db push` を使用する
- migrationベースライン化までは、部分ユニーク制約等をアプリケーションサービスでも強制する

## 10. テスト戦略

### 10.1 ドメインサービステスト

- 候補のfingerprintで重複生成を防ぐ
- `PENDING` だけを承認・棄却できる
- 承認時に確認済み関係と候補状態が同時に更新される
- 修正承認で元候補と確定内容の両方が残る
- 確認者、根拠、参照先が欠けた関係を作れない
- soft delete済み、範囲外、非articleノードを確認済みにできない
- 同じ有効関係を重複作成できない
- 取消後は公開対象から外れる

### 10.2 API統合テスト

- 指定版を参照元とする有効な確認済み関係だけを返す
- `PENDING`、`REJECTED`、未確認候補を返さない
- 取消済み関係を返さない
- soft delete済み、法令集範囲外の参照元・参照先を返さない
- 他版の関係を返さない
- 関係がない場合は空の `relationsBySource` を返す
- `ETag` とキャッシュヘッダーを返す

### 10.3 UI・ブラウザテスト

- 関係がある条文だけに「確認済みの関連 N件」が出る
- 初期状態では閉じている
- 種別、参照先、根拠、確認済みラベルが表示される
- 参照先を新しいタブで開く
- 候補文字列、confidence、抽出方法がHTMLや通信へ漏れない
- 関連APIが失敗しても全文、目次、本文内リンクを利用できる
- 同一法令内をスクロールしても関連APIの追加通信がない

### 10.4 回帰検証

- `web` のVitest全件
- `web` のPlaywright全件
- `web` のTypeScript検査
- `web` のNext.js本番ビルド
- 独立資産 `src/` のVitest全件

## 11. 受入条件

1. 本文に明記された既存の解決済み `Link` は従来どおり新しいタブで開く
2. 機械候補は利用者向けAPI、全文JSON、HTMLへ一切含まれない
3. 人が確認した有効な関係だけが、本文外の「確認済みの関連」に表示される
4. 確認済み関係は確認者、確認日時、根拠、元候補を追跡できる
5. 法令改訂後に旧版の関係を近似移行しない
6. 関連情報の取得失敗で法令本文を隠さない
7. 常設右パネル、編集機能、AI推薦を読者画面へ戻さない
8. 取込再実行で確認済み関係やレビュー履歴を削除しない
9. 既存DBへ `prisma migrate deploy` を実行しない

## 12. 実装順序

1. Prismaモデルと純粋な型・検証関数
2. 候補と確認済み関係のサーバー内部サービス
3. 確認済み関係のリポジトリと公開読取API
4. 読者側の独立取得と部分失敗処理
5. 条ブロック直後の確認済み関連表示
6. 単体・統合・E2Eテスト
7. 全回帰検証と `docs/HANDOFF.md` 更新
