# 横断「論点索引」最小実装設計

- 日付: 2026-08-02
- 対象: `web/`（hourei-rag 起点の Next.js 14 + Prisma 法令リーダー）
- 状態: 対話承認済み、文書レビュー待ち
- 正本DB: `hourei_rag`（PostgreSQL + Prisma）
- 関連: `docs/design-spec.md` v1.3 §1.5、`docs/HANDOFF.md`「次のタスク 1」

## 1. 目的

現在の法令集に収録した120法令を横断し、e-Gov XML の公式 `ArticleCaption` を「論点」として探せる最小の索引を追加する。同じ正規化見出しは1論点へまとめ、選択すると該当する法令・条文を一覧できるようにする。

公式見出し、運営が付ける分類、機械が生成する候補は、出所と確からしさが異なる。本実装は公式見出しだけを公開し、運営分類や機械候補を既存の `PracticeTopic` へ自動投入したり、同じ公開応答へ混ぜたりしない。

## 2. 現状と制約

### 2.1 既存データ

標準取込処理 `web/scripts/ingest.ts` は、e-Gov XML の `ArticleCaption` を次の2列へ保存している。

- `Article.caption`: 括弧を含む公式表示値
- `Article.articleCaptionNormalized`: 外側の全角・半角括弧を除き、前後空白を除去した検索値

2026-08-02 の現行DBでは、法令集収録版に次のデータが存在する。

- 公式見出しを持つ条文: 17,126件
- 正規化後の見出し: 8,745種類
- 対象法令: 120法令
- `caption` があり `articleCaptionNormalized` がない行: 0件

同一見出しは複数法令・複数条文へ現れる。「施行期日」は112法令・2,515条文、「目的」は51法令に存在する。見出し単位の集約と、条文単位のページングが必要である。

### 2.2 Phase 1 の画面制約

- 読者画面は「左: 目次・検索」「中央: 本文」の2列を維持する
- 左パネルの最上位タブは「目次」「検索」の2つを維持する
- 検索結果と論点の該当条文は、比較用の新しいタブで開く
- 補助情報の失敗で法令本文を隠さない
- 常設右パネル、実務パネル、編集画面を追加しない
- 旧 `/api/topics` と `PracticeTopic` を読者の論点索引へ再接続しない

### 2.3 DB適用制約

現在の `hourei_rag` DBは既存migration履歴とのベースライン化前である。本実装ではPrismaモデル、migration、DB列を追加しない。索引は既存 `Article` から再構築可能な読取Projectionとして作る。

## 3. 採用判断

### 3.1 採用: `ArticleCaption` のライブProjection

現在の法令集収録範囲にある `Article` を読取時に集約する。17,126件は現行PostgreSQLでライブ集約できる規模であり、専用索引の再構築や整合管理を持たずに取込結果へ追従できる。

一覧と該当条文は別クエリ・別APIにする。見出し一覧へ全条文を埋め込まず、大量に重複する見出しを選択したときだけ条文を取得する。

### 3.2 不採用: 専用索引テーブル

専用テーブルは将来のタグ付けや高度な検索には有利だが、取込時の再構築、切替、DB migration、ラグ監視が必要になる。最小実装と現在のDB適用制約には過剰である。

### 3.3 不採用: `PracticeTopic` の再利用

既存 `PracticeTopic.source` は `manual | rule | ai` であり、e-Gov公式見出しを表す出所ではない。ここへ公式見出しを投入すると、公式情報、運営分類、機械候補が同じ責務へ混在するため利用しない。

## 4. 公開対象と信頼境界

索引対象は、次をすべて満たす `Article` とする。

1. `deletedAt IS NULL`
2. `caption IS NOT NULL`
3. `articleCaptionNormalized IS NOT NULL` かつ空文字でない
4. `CURRENT_LAW_BOOK_EDITION_KEY` の `LawBookEntry` に所属する
5. `lawBookArticleScopeSql()` が許可する収録範囲内にある

公開DTOの各論点には、次の固定値を必須で含める。

```typescript
type TopicOrigin = "egov_article_caption";
```

この値はe-Gov XMLの `ArticleCaption` に由来することだけを表す。法令自体の `AuthorityClass`、統合状態、検証状態、検索順位の確実性を表さない。

公開DTOへ次を含めない。

- `PracticeTopic` / `ArticlePracticeTopic` のIDや値
- `manual` / `rule` / `ai` の既存 `SourceType`
- confidence、generator、fingerprint
- 運営担当者、レビュー情報
- 推測で生成したタグや階層

## 5. ドメイン契約

### 5.1 論点一覧

```typescript
interface OfficialCaptionTopic {
  key: string;
  label: string;
  origin: "egov_article_caption";
  lawCount: number;
  articleCount: number;
}

interface OfficialCaptionTopicPage {
  query: string;
  items: OfficialCaptionTopic[];
  pagination: {
    page: number;
    pageSize: 50;
    totalItems: number;
    totalPages: number;
  };
}
```

- `key` は `articleCaptionNormalized` と同じ値とする
- `label` も最小実装では正規化値とし、一覧で外側括弧を付け直さない
- `lawCount` は異なる `lawId` の数とする
- `articleCount` は該当する公開対象Articleの数とする
- 同じ法令内で同じ見出しが複数回使われる場合、`lawCount` は1、`articleCount` は実件数を加算する

### 5.2 該当条文一覧

```typescript
interface OfficialCaptionOccurrence {
  articleId: string;
  lawName: string;
  lawShortName: string | null;
  articleNumber: string | null;
  articleNumberNormalized: string | null;
  caption: string;
}

interface OfficialCaptionOccurrencePage {
  topic: {
    key: string;
    label: string;
    origin: "egov_article_caption";
  };
  items: OfficialCaptionOccurrence[];
  pagination: {
    page: number;
    pageSize: 50;
    totalItems: number;
    totalPages: number;
  };
}
```

`caption` はe-Gov由来の公式表示値を返す。条文リンクは既存 `readerArticleHref(articleId)` を使う。

## 6. 検索・集約・並び順

### 6.1 入力正規化

検索語はUnicode文字列として前後空白を除き、外側の全角または半角括弧1組を除く。空文字は「絞込みなし」とする。検索語と詳細取得の `key` は正規化後100文字以内とし、超過または不正ページ番号は400を返す。

SQL `LIKE` / `ILIKE` で特別な意味を持つ `%`、`_`、`\` はリテラルとして扱うようエスケープする。値はすべてバインドパラメータで渡す。

### 6.2 一覧検索

入力なしでは全論点を日本語照合順でページングする。入力ありでは `articleCaptionNormalized` を大文字小文字を区別せずに絞り込み、次の順位にする。

1. 完全一致
2. 前方一致
3. 部分一致

同じ順位内はPostgreSQLの `ja-x-icu` 照合順、最後に `key` のバイナリ順で安定ソートする。対象環境は `ja-x-icu` が利用できることをデプロイ前提とし、利用不能な環境で暗黙に別順序へフォールバックしない。

### 6.3 該当条文の並び順

該当条文は `LawBookEntry.displayOrder`、法令名の日本語照合順、Article IDの昇順で安定ソートする。Article IDは現行取込で文書走査順のゼロ埋め連番を含む。将来ID生成規則を変更する場合は、URL永続性タスクと同時に文書順キーを正本化する。

### 6.4 ページング

ページは1始まり、ページサイズは固定50件とする。利用者指定のページサイズは受け付けない。最終ページを超える正のページ番号は、総件数を保った空の `items` と200を返す。

## 7. 公開読取API

新規エンドポイント:

```text
GET /api/topic-index/official-captions?q={query}&page={page}
GET /api/topic-index/official-captions/articles?key={key}&page={page}
```

規約:

- 一覧の `q` は省略可能、`page` は省略時1
- 条文一覧の `key` は必須、`page` は省略時1
- 存在しない `key` は空ページではなく404を返す
- 入力違反は400、予期しないDB失敗は詳細を隠した500を返す
- エラー応答は `Cache-Control: no-store` とする
- 成功応答は許可fieldだけを再構築し、実行時にDTOを検証する
- 成功応答はJSON本文のSHA-256からETagを生成する
- `If-None-Match` が一致する場合は304を返す
- 成功応答は `Cache-Control: public, max-age=300, stale-while-revalidate=3600` とする

一覧APIと条文一覧APIは、`Article`、`Law`、`LawBookEntry`、`LawBookEdition` だけを読む。`PracticeTopic`、`ArticlePracticeTopic`、候補生成テーブルを参照しない。

## 8. クライアント取得

論点一覧と条文一覧に別のclient/hookを持たせる。キャッシュキーには正規化済み検索語または論点keyとページ番号を含める。

- 同じキーの進行中requestは共有する
- 成功結果は成功時点から5分だけメモリに保持する
- 失敗結果は保持しない
- 再試行は対象キーのキャッシュを破棄して再取得する
- 新しい検索またはページ移動時は古い通信を中止する
- 中止できなかった古い応答もrequest識別子で破棄する
- 不正な200応答は成功扱いせず、許可field以外をUIへ渡さない

論点索引の取得は、利用者が左パネルの「検索」を開き、さらに「論点索引」へ切り替えるまで開始しない。本文初期表示へ新しい通信を追加しない。

## 9. 読者画面

### 9.1 モード切替

既存の左パネル最上位タブ「目次」「検索」は維持する。「検索」タブ内に次の2択を追加する。

```text
[ 条文検索 ] [ 論点索引 ]
```

初期値は「条文検索」とし、現在の本文検索動作を変えない。条文検索語と論点検索語は別々に保持し、モードを切り替えて戻ったときに復元する。

### 9.2 論点一覧

論点索引モードでは、入力欄、出所表示「公式見出し（e-Gov）」、論点一覧、ページ移動を表示する。各論点行には次を表示する。

- 正規化見出し
- 該当法令数
- 該当条文数
- 展開状態

検索語変更または一覧ページ移動時は展開中の論点を閉じる。同時に展開できる論点は1件とする。

### 9.3 該当条文の展開

論点行を選択したときだけ該当条文を取得し、その行の直後へ表示する。各条文には法令名、条番号、公式見出しを表示する。リンクは新しいタブで開き、`target="_blank"` と `rel="noopener noreferrer"` を付ける。

該当条文が50件を超える場合は、展開領域内に独立したページ移動を表示する。ページ移動しても選択中の論点は維持する。

### 9.4 アクセシビリティ

- モード切替はbuttonと `aria-pressed` で状態を示す
- 論点行はbuttonと `aria-expanded` / `aria-controls` で展開関係を示す
- 読込中、件数、エラーはスクリーンリーダーへ通知する
- キーボードだけでモード切替、論点展開、ページ移動、条文リンク選択ができる

## 10. 画面状態と部分失敗

論点一覧は次を区別する。

1. 初回読込中
2. 通常一覧
3. 検索0件
4. 一覧取得失敗
5. ページ移動中

展開領域は次を区別する。

1. 未取得
2. 読込中
3. 通常一覧
4. 取得失敗
5. ページ移動中

一覧取得失敗は左パネル内だけにエラーと再試行を表示する。展開失敗は対象論点行の内部だけにエラーと再試行を表示する。いずれの場合も法令本文、目次、既存の条文検索を隠さない。候補データや旧 `/api/topics` を代替表示しない。

## 11. タグと将来拡張

「設備」「構造」「手続」等は、将来追加するときもフォルダ階層にしない。1論点へ0個以上のタグを割り当てる多対多関係とする。

本実装ではタグのDBモデル、入力、表示、フィルターを追加しない。公式見出しDTOへ空の `tags` や推測分類を入れない。将来のタグ設計では少なくとも次を別管理する。

- タグ語彙そのもの
- 論点へのタグ割当
- 割当の出所（運営確認または機械候補）
- 機械候補のconfidence、generator version、レビュー状態

機械候補を公開タグへ昇格するときは、人が確認した別レコードを作る。候補の状態変更だけで公開しない。公式見出しの `origin` とタグ割当の出所を同じfieldで表現しない。

## 12. 実装境界

初回実装に含める。

- 公式見出し索引のドメイン型、正規化、DTO検証
- 現行法令集収録範囲だけを読むrepository
- 論点一覧API、該当条文一覧API、ETag、キャッシュ
- client/hookのrequest共有、5分キャッシュ、再試行
- 検索内モード切替、論点一覧、展開、ページ移動
- 単体、統合、API、コンポーネント、E2E、性能検証
- `docs/design-spec.md` と `docs/HANDOFF.md` の実装後更新

初回実装に含めない。

- Prismaスキーマ・migration変更
- `PracticeTopic` への公式見出し投入
- 運営タグの作成・割当・編集・表示
- 機械候補生成、confidence表示、Review Queue
- 本文への論点リンク埋込み
- 右パネルや第3の最上位タブ
- 旧 `/api/topics` の削除や別用途コードの整理
- `src/` 側DBとの統合
- Article IDやURL永続性の変更

## 13. 検証

### 13.1 純粋関数・DTO

- 全角・半角括弧と前後空白の入力正規化
- `%`、`_`、`\` のLIKEエスケープ
- ページ、検索語長、必須keyの検証
- 正しいDTOの受理と、不正200応答の拒否
- 公開DTOへ候補・confidence・generator情報が入らないこと

### 13.2 Repository・API統合

- 同じ正規化見出しが1論点へまとまること
- `lawCount` と `articleCount` が別々に正しいこと
- soft delete、別版、法令集範囲外、検証済み抄録の収録範囲外を返さないこと
- 完全一致、前方一致、部分一致の順になること
- 日本語照合順とタイブレーカーが安定すること
- 一覧と条文一覧のページ間に重複がないこと
- 400、404、500、ETag、304、Cache-Controlの契約

### 13.3 Client・UI

- 進行中request共有、成功時から5分のキャッシュ、失敗非保持
- 古い検索応答が新しい一覧を上書きしないこと
- 初期モードが条文検索であること
- モードごとの検索語を保持すること
- 公式見出しの出所、法令数、条文数を表示すること
- 同時展開が1件であること
- 新しいタブへの安全なリンクであること
- 一覧失敗と展開失敗が本文を隠さないこと

### 13.4 E2E・回帰

- 「目的」等の公式見出しから複数法令の条文を横断できること
- 論点索引へ切り替える前に新APIを呼ばないこと
- 旧 `/api/topics` を呼ばないこと
- 論点API失敗時も全文法令リーダーが閲覧できること
- 既存の全文表示、目次、URL同期、確認済み関連が回帰しないこと

## 14. 受入条件

- 公式見出し以外の運営分類・機械候補を公開しない
- 同一正規化見出しを1論点へまとめ、複数法令・複数条文を展開できる
- 一覧・展開とも固定50件で安定してページ移動できる
- 代表検索と初期50件取得が、ローカル本番ビルド・ウォーム状態で各500ms以内
- 論点索引の全面失敗時も法令本文と既存条文検索を利用できる
- `web` の全Vitest、Playwright、TypeScript検査、Next.js本番ビルドが合格する
- `src/` の独立テストが回帰しない
- Prisma schema validateが合格し、稼働DBとの差分を新たに発生させない
