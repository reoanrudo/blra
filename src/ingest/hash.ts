/**
 * content_hash 計算ユーティリティ。
 *
 * 設計書 §8.1: Raw Artifact を保存した後に Hash 比較を行う。
 * §13.1: source_version の content_hash 列。UNIQUE(source_id, content_hash) 制約。
 *
 * ハッシュ対象は原本XML全文。SHA-256 の hex 先頭16文字。
 * 衝突耐性: 2^128 分の1。同一 Source 内での版同定用途には十分。
 */

import { createHash } from "node:crypto";

/**
 * 原本XML文字列から content_hash を計算する。
 * @param xml 法令標準XML 全文
 * @returns SHA-256 hex 先頭16文字
 */
export function computeContentHash(xml: string): string {
  return createHash("sha256").update(xml, "utf8").digest("hex").slice(0, 16);
}
