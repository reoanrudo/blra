-- 読みやすい条文表示機能とハイライト整合性のためのカラム追加。
--
-- Article:
--   inlineMarkup  - インラインマークアップ（注記・ルビ等）。現状は未使用だが将来拡張用。
--   tableMetadata - テーブル構造メタデータ。現状は未使用だが将来拡張用。
--
-- UserHighlight:
--   exactQuote     - ハイライト範囲の引用テキスト（公式原文）。サーバー側で生成。
--   anchorChecksum - アンカー整合性チェックサム（SHA-256先頭16文字）。
--                    条文改正後の再アンカー検証に使用。

ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "inlineMarkup" JSONB,
  ADD COLUMN IF NOT EXISTS "tableMetadata" JSONB;

ALTER TABLE "UserHighlight"
  ADD COLUMN IF NOT EXISTS "exactQuote" TEXT,
  ADD COLUMN IF NOT EXISTS "anchorChecksum" TEXT;
