# BLRA 引き継ぎ（2026-08-02・全文法令リーダー Phase 1）

BLRA（建築法令リファレンス）の作業ディレクトリは
`/Users/taguchireo/Downloads/blra`。

## 最初に読むもの

1. `docs/HANDOFF.md` — 本ファイル。現在地と直近の優先順位
2. `docs/design-spec.md` — 設計の正本（v1.3・Normative）
3. `git log --oneline` — 発見・判断・実装単位の履歴

実装計画は
`docs/superpowers/plans/2026-08-02-reader-full-law.md`、適用時点機能の
過去の実装記録は
`docs/superpowers/plans/2026-07-31-applicability-context.md` を参照する。

## 現在地

**`web/` の hourei-rag（Next.js 14 + Prisma）をフロントの正本とし、
e-Gov 型の「選択した法令を一度に読み込む全文リーダー」を Phase 1 とする。**

従来の `web/`（Vite + React）へ機能を移植する方針には戻さない。
`src/` の Fastify + Kysely は独立資産として残す。

### Phase 1 で確定した読者体験

- 選択した法令の収録全文を、DB の表示・リンク解決規則を適用して1つのJSONで取得する
- 全文を最初から同一DOMに置く。目次移動や深い条文の直URLで章単位の追加通信をしない
- 画面は「左: 目次・検索」「中央: 本文」の2列。実務パネルは表示しない
- 目次は同じタブ内で移動し、検索結果と本文参照は比較用の新しいタブで開く
- URL の条文IDはスクロール位置に追従する。全DBノードに重複しない固定アンカーを持たせる
- 表示は算用数字等に整形してよいが、コピー時はe-Gov由来の公式原文を復元する
- 改正・施行の確認は、画面上部からe-Govを新しいタブで開く
- 読者画面からプロジェクト、保存、注釈、チェック、AI推薦、ログインを外す

### Phase 1 で表示しないもの

- 適用時点バー、旧版保存、本文差分
- NoticeBand（経過措置・未施行改正）
- 実務パネル、未確認の自動推薦リンク
- 編集画面と顧客による編集機能

適用時点関連のコードとDB列は既存資産として残っているが、現在の読者画面には
接続しない。複数版の網羅性と検証状態を担保してから再導入する。

## 2026-08-02 の実装成果

### 全文データ経路

- `GET /api/law-revisions/:id/document` を追加
- 法令メタデータ、収録範囲内の全ノード、DBで解決済みの参照を並列取得
- soft delete済み・現在の法令集範囲外・未解決リンクを本文ペイロードから除外
- ETag、5分キャッシュ、24時間の stale-while-revalidate を設定
- gzip対応クライアントには圧縮して返し、`Vary: Accept-Encoding` を設定

### 全文表示

- `FullLawReader` / `FullLawViewer` を中心に全文を連続表示
- DB上の `column`、`table_struct` を含む不可視ノードにも固定アンカーを設置
- 建築基準法では2,904ノードすべてのアンカーが存在し、重複0件
- 直URL、目次、スクロールURL同期のいずれでも同じ条文ID契約を使用
- 既存の chapter-window / chapter-aux APIと部品は残っているが、Phase 1読者画面は呼ばない

### 確認済み関連条文

- 既存の本文中 `Link`（明示された条文参照）と、本文に明記されない実務上の関連を分離した
- 自動生成の候補は `RelatedArticleCandidate` に閉じ、公開API・読者画面の対象は
  人が確認した `ConfirmedArticleRelation` だけとする。候補のconfidence、生成器、
  fingerprint等を公開ペイロードへ混ぜない
- `GET /api/law-revisions/:id/confirmed-relations` を追加。ETagと
  `Cache-Control: public, max-age=60, stale-while-revalidate=300` を返す
- 確認済み関連の200応答は実行時にDTOを検証し、許可fieldだけを再構築して版一致も確認する。
  不正な200応答は本文を保った部分障害へ移し、成功データは進行中requestを共有した上で
  成功時から60秒だけclient cacheに保持する（`2bb8a17`）
- 確認済み関連は各条ブロックの直後に、初期状態で閉じた一覧として表示する。
  0件なら一覧を表示しない。対象リンクは新しいタブで開く
- 関連APIだけが失敗した場合は本文を隠さず、関連部分のエラー表示と再試行だけを出す
- 候補の書込競合はretry枯渇後にも最終状態を再読込・再評価し、型付きdomain conflictへ
  収束させる。生のPrisma code / causeは呼出元へ露出しない（`ac4ace2`）
- Review Queue、自動候補生成、実在する確認済み関係のseedは未実装。読者表示のために
  実在関係を自動投入してはならない

### 本番相当の実測（ローカル・2026-08-02）

| 法令 | JSON原寸 | gzip転送 | 全文表示完了 | 最下部移動 | 移動後の追加通信 |
|---|---:|---:|---:|---:|---:|
| 建築基準法 | 2.83 MB | 231 KB | 3.41秒 | 262 ms | 0 |
| 建築基準法施行令 | 4.13 MB | 306 KB | 1.86秒 | 240 ms | 0 |
| 建築基準法施行規則 | 11.01 MB | 507 KB | 2.87秒 | 282 ms | 0 |
| 労働安全衛生規則 | 12.42 MB | 731 KB | 3.57秒 | 442 ms | 0 |

表示完了値にはDB取得、JSON復号、React描画を含む。ネットワーク遅延のないローカル値。
計測は `cd web && npx tsx scripts/bench-full-law.ts` で再実行できる。

## 検証状態

- `web`: Vitest 351件合格（36 files、2026-08-02、通常実行）。確認済み関連のfixture衝突を
  検出し、`310e846` でfixtureを分離して再確認した
- `web`: Playwright 14件合格（2列、不要APIなし、全文DOM、直URL、目次、固定アンカー、
  原文コピー、別タブ、確認済み関連、関連API部分失敗、不正200応答）
- `web`: TypeScript合格
- `web`: Next.js 14.2.35本番ビルド合格。静的29ページを生成し、confirmed-relations routeも成功
- `src`: Vitest 136件合格（15 files、`npm test -- --run`）
- Prisma schema validate合格、稼働DBとの差分なし（`No difference detected`、exit 0）
- Web Vitest後にfixture残件0をPrismaで確認。`relation-test-` / `@example.invalid` の
  テストユーザー、`RelatedArticleCandidate`、`ConfirmedArticleRelation` はすべて0件
- 公開route・repository・client・hook・componentに候補固有語は混入していない
- 実ブラウザ相当のrequest listenerで、建築基準法第1条の初期表示は全文API /
  確認済み関連APIが1 / 1回、目次移動後も1 / 1回、スクロール後も1 / 1回を確認。
  関係0件では一覧も非表示。計測用dev serverは停止済み

## 次のタスク（順番）

関連誘導強化の要件整理（現状定量評価・3層ギャップ・優先度・ユーザーストーリー）と
コンセプト整合性評価を含む総括要件定義は
`docs/superpowers/specs/2026-08-07-related-navigation-requirements.md` を正本とする。
本節のタスク1は同書 §6.2、委任参照の段階的導線は同書 §6.1、
計測基盤（一級建築士法規過去問ベンチマーク・Search Evaluation Harness）は同書 §6.7〜6.8、
タスク4（NoticeBand・適用時点）の前提となる時点管理の再定義は同書 §6.9 に対応する。

計測基盤は、令和3〜7年150問のマニフェスト、公式正答肢、学習120問／未見評価30問の分離、
Recall@10・MRR等の評価器まで実装済み。令和3年30問の派生検索課題と根拠条文セットは
`web/benchmarks/architect-law-exam-ground-truth.json` へ下書き登録済み（30 / 150問、検証済み0問）。
現行30問は正答主要論点だけを持つ部分データであり、全選択肢由来の派生論点と統合判断は未整備。
当時法令との突合が完了していない `draft` データは評価対象にならない。次は
`docs/superpowers/specs/2026-08-09-compound-architect-law-problem-design.md` に従い、Schema Version 2
の階層型データと検証規則を実装してから、令和3年30問を全論点へ再整理する。

### 1. 「論点索引」の最小実装

e-Gov XMLの公式 `ArticleCaption`（括弧書き見出し）だけを初期候補にする。
「設備」「構造」「手続」等はフォルダ階層ではなく複数タグとして扱う。
公式見出し、運営が付けた分類、機械候補を同じ確からしさで混ぜない。

### 2. 出典の確からしさ

`AuthorityClass`、`consolidation_state`、`verification_status` を
hourei-rag側のPrismaモデルと取込に対応させる。バッジを先に作らず、値の生成元と
更新規則を確定してから読者画面へ出す。

### 3. 読者画面の6状態

標準、空、読込中、部分失敗、全体失敗、権限不足をPhase 1の2列構成に合わせて整理する。
本文が取得できた場合は補助情報の失敗で本文を隠さない。

### 4. NoticeBand と適用時点

改正・施行・経過措置を判定できる版データと検証状態が揃ってから追加する。
不完全な版データから推測表示しない。当面はe-Govへの公式導線を正とする。

### 5. URLの永続性

取込再実行後も条文URLが保たれるかを確認し、削除・範囲外になったIDの
tombstone方針を決める。

## 開発環境

```bash
docker compose up -d

cd web
npm run dev               # http://localhost:3000
npm test                  # フロントUnit/Integration
npx playwright test       # ブラウザE2E
npm run build             # 本番ビルド

cd ..
npm test                  # src/独立資産
```

DBは2系統が並存する。

- `web/` → Prisma → `hourei_rag`（現在のフロントの正）
- `src/` → Kysely → `blra`（独立資産）

現在の `hourei_rag` DB は過去に `prisma db push` で構築され、既存migration履歴と
整合していない。履歴をベースライン化するまでは、このDBに
`prisma migrate deploy` を実行しない。

## 実装上の禁止事項

- `docs/design-spec.md` v1.3 と矛盾する実装をしない
- 未確認候補を確認済みリンクとして本文へ出さない
- 版が曖昧なときに近似本文を正しい本文として出さない
- Phase 1読者画面へ実務パネルや編集機能を戻さない
- `src/` と `web/` のDB統合を、別タスクのついでに行わない
