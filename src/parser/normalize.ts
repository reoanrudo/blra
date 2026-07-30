/**
 * 検索用の本文正規化。
 *
 * 設計書 §9.3 の規則に従い、body → body_normalized へ変換する。
 * 表示用の変換（§6.2）とは別物。ここでは検索索引と fingerprint の原料を作る。
 *
 * 正規化規則:
 * 1. NFKC 正規化（全角英数・半角カナの統合）
 * 2. 連続する空白類（スペース・タブ・改行・全角スペース）を1つの半角スペースへ
 * 3. 前後の空白を除去
 *
 * §9.3 の除外規則（表示用変換で行うべきもの）はここでは適用しない:
 *  - 漢数字→算用数字の変換（正規化で行うと条項番号の同定が壊れる）
 *  - 単位名称→記号の変換
 *  - 元号・西暦の相互展開
 * これらは Query Expander（検索時）で行うべき処理であり、本文の fingerprint に
 * 混ぜてはならない（設計書 §4.3: 正規化差分を改正判定に使わない）。
 */

import { createHash } from "node:crypto";

/**
 * 本文を正規化する。
 * body → body_normalized の変換。検索索引と content_fingerprint の原料。
 */
export function normalizeBody(text: string): string {
  // 1. NFKC 正規化
  let result = text.normalize("NFKC");

  // 2. 連続する空白類を1つの半角スペースへ
  //    \s に加えて全角スペース（U+3000）も対象
  result = result.replace(/[\s\u3000]+/g, " ");

  // 3. 前後の空白を除去
  return result.trim();
}

/**
 * body_normalized から content_fingerprint を生成する。
 * 設計書 §6.1: 正規化本文のハッシュ。
 * SHA-256 の hex 先頭16文字（衝突耐性十分。同一 Source 内での同定用途）。
 */
export function fingerprint(normalizedBody: string): string {
  return createHash("sha256")
    .update(normalizedBody, "utf8")
    .digest("hex")
    .slice(0, 16);
}
