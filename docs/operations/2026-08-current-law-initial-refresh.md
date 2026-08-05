# 初回現行化実行記録 — 2026年8月

本書は法令データ更新機能（Task 1〜14）の実装完了後、初回現行化（Task 15）を実行した際の監査可能な要約である。

## 実行環境

| 項目 | 値 |
|------|-----|
| 実行日時 | _実行時に記載_ |
| 対象日（asOf） | _実行時に記載_ |
| 実行者 | _実行時に記載_ |
| ブランチ | codex/current-law-refresh |
| コミット | _実行時のHEAD_ |

## バックアップ

| 項目 | 値 |
|------|-----|
| DB バックアップパス | _実行時に記載_ |
| バックアップ検証（pg_restore --list） | _実行時に記載_ |

## check-only 結果（Step 3）

```json
{
  "asOf": "_実行日_",
  "checked": 120,
  "unchanged": "_実行時に記載_",
  "updated": 0,
  "held": 0,
  "failed": 0
}
```

## dry-run 結果（Step 4）

```json
{
  "checked": 120,
  "unchanged": "_実行時に記載_",
  "updated": "_実行時に記載_",
  "held": "_実行時に記載_",
  "failed": 0
}
```

held > 0 の場合は、各差分報告と公式XMLを確認し、Task 5 の schema に従う reviewed mapping/guard approval JSON を revision pair ごとに作成した上で dry-run を再実行し held=0 を確認する。

## 本更新結果（Step 5）

| 項目 | 値 |
|------|-----|
| run ID | _実行時に記載_ |
| package checksum | _実行時に記載_ |
| checked | 120 |
| unchanged | _実行時に記載_ |
| updated | _実行時に記載_ |
| held | 0 |
| failed | 0 |

### 建築基準法（325AC0000000201）の Revision 遷移

| 項目 | 値 |
|------|-----|
| 旧 Revision ID | _実行時に記載_ |
| 新 Revision ID | _実行時に記載_ |
| 差分種別 | _実行時に記載_ |

## 検証結果（Step 6）

| 検証項目 | 結果 |
|----------|------|
| `lawbook:current:verify --online`（120法令オンライン版番号一致） | _実行時に記載_ |
| `lawbook:verify`（固定書籍版 baseline） | _実行時に記載_ |
| `test:integration` | _実行時に記載_ |
| `bench:article`（平均300ms未満） | _実行時に記載_ |
| `bench:search`（平均200ms未満） | _実行時に記載_ |
| 検証済み民法61範囲の resolved | _実行時に記載_ |
| Article/Link 公開境界違反 | 0件 |

## 全自動テスト・ブラウザ導線（Step 7）

| 検証項目 | 結果 |
|----------|------|
| Web Vitest | _実行時に記載_ |
| TypeScript（tsc --noEmit） | _実行時に記載_ |
| production build | _実行時に記載_ |
| HTTP E2E | _実行時に記載_ |
| Playwright（full-law-reader / current-law-refresh） | _実行時に記載_ |
| root tests / typecheck | _実行時に記載_ |
| 固定「収録基準日: 2026-01-01」表示 | 0件 |

## 備考

- 秘密鍵パス、DB URL、XML本文、内部error detailは本書へ記載しない。
- reviewed mapping ファイルが必要だった場合は `web/config/law-refresh-mappings/` へ配置し、本書へ一覧を記載する。
- 実行後は `web/src/lib/law-book/current-scope.ts` の legacy range fallback 除去可否を Task 9 backfill 完了状況に基づき判断する（Step 10）。
