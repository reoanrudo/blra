/**
 * パイプライン後段の Validation。
 *
 * 設計書 §8.3 Validation で落とすもの:
 *  - 抽出率の異常（95%未満）
 *  - 文字化けの疑い（制御文字の混入）
 *  - Parser 層のエラー（M2 validateSegments の結果を集約）
 *
 * 前版 Provision 消失比較は現行版1つのためスキップ（Phase 2 で複数版時）。
 */

import type { ParseStats, ValidationError } from "../parser/types.js";

/** 抽出率の warning 閾値 */
const EXTRACTION_RATE_THRESHOLD = 0.95;

/** 文字化け判定の制御文字パターン（タブ0x09・改行0x0A・復帰0x0D 以外の C0制御文字） */
const GARBLED_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Publish 判定の warning 数上限（これ超は Review 行き） */
const MAX_WARNINGS_FOR_PUBLISH = 10;

/**
 * パイプライン全体の Validation を行う。
 * Parser層エラー + 抽出率 + 文字化けチェックを統合する。
 *
 * @param stats Parser の抽出率統計
 * @param parserErrors Parser（M2 validateSegments）のエラー
 * @param bodies 全 segment の本文（文字化けチェック用）
 * @returns 統合された Validation エラー・警告リスト
 */
export function validatePipeline(
  stats: ParseStats,
  parserErrors: ValidationError[],
  bodies: string[],
): ValidationError[] {
  const errors: ValidationError[] = [...parserErrors];

  // 1. 抽出率チェック（§8.3）
  if (stats.totalChars > 0 && stats.extractionRate < EXTRACTION_RATE_THRESHOLD) {
    errors.push({
      level: "warning",
      message: `抽出率が閾値を下回っています: ${(stats.extractionRate * 100).toFixed(1)}% (閾値 ${EXTRACTION_RATE_THRESHOLD * 100}%)`,
    });
  }

  // 2. 文字化けチェック（§8.3: 文字化けの疑い）
  const garbledCount = bodies.filter((b) => GARBLED_CHAR_PATTERN.test(b)).length;
  if (garbledCount > 0) {
    errors.push({
      level: "warning",
      message: `文字化けの疑い: ${garbledCount} 件の本文に制御文字が混入しています`,
    });
  }

  return errors;
}

/**
 * Validation 結果から Publish 可否を判定する。
 * §8.3: error が1件でもある、または warning が閾値超なら Review Queue 行き。
 *
 * @param errors validatePipeline の戻り値
 * @returns true = 自動Publish、false = Review Queue（published_at = NULL）
 */
export function shouldPublish(errors: ValidationError[]): boolean {
  const hasError = errors.some((e) => e.level === "error");
  if (hasError) return false;

  const warningCount = errors.filter((e) => e.level === "warning").length;
  return warningCount <= MAX_WARNINGS_FOR_PUBLISH;
}
