/**
 * e-Gov 法令標準XML Parser のエントリポイント。
 *
 * 設計書 §8.1 の Pipeline のうち Parser + Normalizer + Segmenter + Anchor Generator
 * を統合した純関数。XML文字列 → ProvisionSegment[] へ変換する。
 *
 * M2 では HTTP 取得・DB 書き込みを行わない。
 * M3 のパイプライン統合で Fetcher の出力をこの関数へ渡す。
 *
 * 設計書 §8.2-1: 同じ入力と同じ ParserVersion から同じ出力を得る（冪等）。
 */

import { parseXml, findFirst } from "./xml-to-tree.js";
import { segment, validateSegments } from "./segment.js";
import { PARSER_VERSION } from "./types.js";
import type {
  ParseInput,
  ParseOutput,
  ParseResult,
  ParseStats,
} from "./types.js";

/**
 * 法令標準XML をパースして ProvisionSegment[] へ分解する。
 *
 * @param input.xml 法令標準XML 文字列
 * @param input.jurisdiction citation_anchor の jurisdiction 部分（例: "jp"）
 * @param input.sourceIdentity citation_anchor の sourceIdentity 部分（例: "law/325AC0000000201"）
 * @returns パース結果（segments, stats, errors）
 */
export function parse(input: ParseInput): ParseResult {
  // 1. XML → LawNode 木
  const root = parseXml(input.xml);

  // 2. LawBody を見つける（法令標準XML は <Law><LawBody>...</LawBody></Law> 構造）
  const lawBody = findFirst(root, "LawBody");
  if (!lawBody) {
    throw new Error(
      "法令標準XML に LawBody 要素が見つかりません。XML 構造を確認してください。",
    );
  }

  // 3. LawBody → ProvisionSegment[] へ分解
  const { segments, consumed, totalChars } = segment(
    lawBody,
    input.jurisdiction,
    input.sourceIdentity,
  );

  // 4. 抽出率計測
  //    分子: 全 segment の (heading + body) の空白除去後文字数の合計
  //    分母: LawBody 配下の NON_BODY_TAGS を除く全テキストの空白除去後文字数
  const capturedChars = segments.reduce(
    (sum, s) => sum + (s.heading + s.body).replace(/\s/g, "").length,
    0,
  );

  const stats: ParseStats = {
    totalChars,
    capturedChars,
    extractionRate: totalChars > 0 ? capturedChars / totalChars : 1,
  };

  const output: ParseOutput = {
    parserVersion: PARSER_VERSION,
    segments,
    stats,
  };

  // 5. Validation（§8.3）
  const errors = validateSegments(segments);

  // consumed は内部計測用。外部へは出さない。
  void consumed;

  return { output, errors };
}

// 型の再エクスポート（利用側が個別ファイルを import しなくて済むように）
export type {
  ParseInput,
  ParseOutput,
  ParseResult,
  ProvisionSegment,
  ProvisionType,
} from "./types.js";
export { PARSER_VERSION } from "./types.js";
