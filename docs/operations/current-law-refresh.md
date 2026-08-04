# 現行法令差分更新 運用手順書

本書は e-Gov 法令API v2 から現行法令（施行中の版）を取得し、データベースへ差分反映する
一連の運用手順を固定するものです。計画書 `2026-08-04-current-law-incremental-refresh.md`
Task 14 に基づきます。

## 1. 前提

### 1.1 ディレクトリと環境変数

すべての操作は `web/` ディレクトリを起点とする。

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | （必須） | 公開用データベースの接続文字列 |
| `LAW_XML_STORAGE_DIR` | `./var/law-xml` | e-Gov から取得した公式XMLの不変保存先（`.gitignore` 済み） |
| `LAW_PACKAGE_SIGNING_KEY_PATH` | （更新時必須） | Ed25519 秘密鍵ファイルのパス |
| `LAW_PACKAGE_SIGNER_KEY_ID` | （更新時必須） | 鍵の識別子（公開鍵 lookup 用） |
| `EGOV_API_BASE` | `https://laws.e-gov.go.jp/api/2` | e-Gov 法令API v2 のエンドポイント |

### 1.2 鍵管理

署名鍵ペアは `npm run lawbook:current:keygen` で生成する。秘密鍵は `.gitignore` 済みの
`.secrets/` 配下（mode 0600）へ保存され、公開鍵は署名検証で参照する。

```bash
# 初回のみ（環境ごとに1回）
npm run lawbook:current:keygen
# → .secrets/private.pem (0600), .secrets/public.pem を生成
#   実値を web/.env へ設定する
export LAW_PACKAGE_SIGNING_KEY_PATH=/absolute/path/web/.secrets/private.pem
export LAW_PACKAGE_SIGNER_KEY_ID=$(cat /absolute/path/web/.secrets/key-id.txt)
```

**公開環境（本番）がない間は cron を有効化しないこと。** 鍵設定・DB・XML保存先が揃うまで
手動実行のみとする。

### 1.3 reviewed decision ファイルの命名規則

改番候補（renumbered_candidate / ambiguous）や構造変化保留
（STRUCTURE_CHANGE_REVIEW_REQUIRED）を人手で承認した結果は、JSON ファイルとして
`<reviewDir>/<lawId>.json` へ配置する。

- `--review-dir <path>` で指定したディレクトリ配下を探索する
- ファイル名は法令の `lawId`（e-Gov法令IDと同じ文字列）に `.json` を付けたもの
- 例: `config/law-refresh-mappings/325AC0000000201.json`
- ファイルが存在しない法令は通常パス（held 扱い）へ戻る
- schema 違反・checksum/law/revision 不一致は `REVIEW_FILE_INVALID` エラーになる

ファイルの schema は `web/src/lib/law-refresh/reviewed-mappings.ts` の
`ReviewedRevisionDecision` 型を参照すること。

## 2. 定期確認（日次 cron）

毎日 04:00 (Asia/Tokyo) に現行法令の差分を確認し、必要があれば更新する。

```cron
CRON_TZ=Asia/Tokyo
0 4 * * * cd /absolute/deployment/path/web && npm run lawbook:current:refresh >> /absolute/log/path/current-law-refresh.log 2>&1
```

`npm run lawbook:current:refresh` は check + refresh を兼ねる。内部で
advisory lock（`pg_try_advisory_lock`）を取得し、重複実行を `REFRESH_ALREADY_RUNNING`
で拒否するため、並行起動は安全。

## 3. 手動実行フロー（dry-run → 本実行）

### Step 1: オンライン確認のみ（DB書き込みなし）

```bash
cd /absolute/deployment/path/web
npm run lawbook:current:check -- --asof $(date +%Y-%m-%d)
```

e-Gov API へアクセスし、各法令の最新 version key と `LawSyncState.lastObservedVersionKey`
を比較する。変更があれば stdout へ報告するが、DBへは書き込まない。

### Step 2: dry-run（取得・parse・verify まで、DB書き込みなし）

```bash
npm run lawbook:current:refresh -- --asof $(date +%Y-%m-%d) --dry-run
```

候補 Revision の取得・XML parse・差分検出・verify まで実行するが、
`activateCandidateRevision`（DB書き込み）は行わない。held/failed の有無を確認できる。

### Step 3: 本実行（全法令）

```bash
npm run lawbook:current:refresh -- --asof $(date +%Y-%m-%d) --json
```

`--json` を付けると stdout は `RefreshRunReport` の JSON のみになり、進捗ログは stderr
へ出力される（パースしやすい）。終了コードで結果を判定する（後述）。

### Step 4: 単一法令の再試行

部分保留（exit code 2）になった法令を個別に再試行する。

```bash
npm run lawbook:current:refresh -- --asof $(date +%Y-%m-%d) --law 325AC0000000201
```

`--law <egovLawId>` は複数回指定可能。

## 4. 終了コード

| code | 意味 |
| --- | --- |
| 0 | 全成功、または全法令無変更 |
| 2 | 部分保留（held または failed が1件以上あるが全滅ではない） |
| 1 | 致命的エラー（未知 law ID / 未来日 / lock 取得失敗 / 全法令 check 失敗 / 引数エラー） |

cron の `&&` / `||` で分岐させる際の目安:

```bash
npm run lawbook:current:refresh -- --json \
  && echo "全成功" \
  || { [ $? -eq 2 ] && echo "部分保留あり。個別再試行を検討" || echo "致命的エラー"; }
```

## 5. advisory lock

`withRefreshLock` は PostgreSQL の advisory lock
（`pg_try_advisory_lock`、timeout 600秒）を取得する。実行中に別プロセスが起動すると
`REFRESH_ALREADY_RUNNING` エラー（exit code 1）で即座に終了する。

長時間のプロセス異常終了で lock が残った場合は、接続の終了で自動解放される。
手動で解放する必要はない。

## 6. 部分保留時の対応

`held` になる主な原因と対応:

1. **STRUCTURE_CHANGE_REVIEW_REQUIRED**: 構造変化（章・節の大規模変更等）のため人手確認が必要。
   reviewed decision ファイルを `<reviewDir>/<lawId>.json` へ作成し、`--review-dir` 付きで再実行。

2. **renumbered_candidate / ambiguous**: 条番号の変更候補。人手で新旧 durable key の対応を
   確定し、reviewed decision へ記述する。

3. **ネットワークエラー**: e-Gov API への一時的な接続失敗。時間を置いて
   `--law <egovLawId>` で個別再試行。

部分保留（exit code 2）でも、成功した法令の現行版は既に切り替わっている。UIの running header は
「最終確認」日時で各法令の状態を表示するため、確認失敗法令は「最終検証済みe-Gov版」見出しと
注意文で表現される（計画書 Task 14 Step 4）。

## 7. バックアップと復元

### 7.1 XML保存先

`LAW_XML_STORAGE_DIR`（既定 `./var/law-xml`）配下へ
`<lawId>/<revisionId>/<sha256>.xml` として原子的に保存される。このディレクトリは
再取得可能な成果物のため git 管理外だが、バックアップ対象には含めること。

### 7.2 DB バックアップからの復元

現行版の切替は `Law.currentRevisionId` の compare-and-swap で行われる。
誤って切替えた場合は、バックアップした `currentRevisionId` を戻すことで復元できる。

```sql
-- 復元例: 特定法令の現行版を旧 Revision へ戻す
UPDATE "Law"
SET "currentRevisionId" = '<旧revisionId>'
WHERE id = '<lawId>' AND "currentRevisionId" = '<現revisionId>';
```

active でなくなった Revision の Article は soft delete されず残るため、
旧 Revision へ戻しても Article データは失われていない。

## 8. 公開環境の有効化

本番公開前に以下を全て満たすこと:

1. `LAW_PACKAGE_SIGNING_KEY_PATH` / `LAW_PACKAGE_SIGNER_KEY_ID` が設定済み
2. `LAW_XML_STORAGE_DIR` が永続ボリュums上にある
3. `EGOV_API_BASE` が到達可能な e-Gov API を指している
4. dry-run で全法令の verify が通ることを確認済み
5. cron へ日次ジョブを登録する（第2節の crontab 参照）

**上記が揃うまで cron を有効化しないこと。** 公開環境がない間は手動実行のみとする。

## 9. 表示の検証

現行版の施行日・確認状態は全文法令リーダーの running header へ表示される。

- verified: 見出し「e-Gov現行施行版」+ 施行日 / e-Gov更新 / 最終確認
- check_failed: 見出し「最終検証済みe-Gov版」+ 注意文
- never_checked: 見出し「e-Gov版（最新確認未完了）」+ 注意文
- 廃止法令: 「廃止: YYYY-MM-DD」表示 + 一覧で「廃止」ラベル

法令一覧API（`/api/laws`）は `corpusVersion`（120件の `(lawId, currentRevisionId)` を
掲載順で SHA-256 化）を返す。法令更新で値が変わり、クライアントの 5分キャッシュが
失効する。E2E（`web/scripts/e2e-law-book.ts`）は corpusVersion の非空を assert する。
