-- 既存ハイライトの anchorChecksum を旧形式（座標文字列 "start-end"）から
-- 新形式（SHA-256 先頭16文字）へ再計算する。
--
-- PostgreSQL 標準では SHA-256 が利用できないため（pgcrypto未導入）、
-- 実際の再計算は TypeScript backfill スクリプトで実行し、
-- この migration は prisma migrate resolve --applied で履歴記録のみを行う。
--
-- 新形式の素材: 範囲前後のコンテキスト（前10文字 + 引用文 + 後10文字）
-- 新形式の生成ロジックは user-highlights/route.ts の computeAnchorChecksum と同一。
-- exactQuote も同時にサーバー側で再生成する（article.text からの slice）。
--
-- これにより既存ハイライトも改正後の再アンカー検証に使用可能になる。

-- この migration は no-op（データ更新は backfill スクリプトで実行済み）。
SELECT 1;
