/**
 * 法令本文表示用の漢数字変換ユーティリティ（設計書§4.2, §4.3, §4.1）。
 *
 * 本文中の数量表現を算用数字化し、法的構造を持つ表現（区分・等級・号構造・公布番号）を除外する。
 * 除外判定は変換前のトークン判定で行い、該当するか不明な表現は変換しない（設計書§4.3）。
 *
 * すべて純粋関数・DBアクセスなし（設計書§10 性能要件）。
 */

import { kanjiToArabic } from "@/lib/article/normalize-article";

/**
 * 漢数字を含むかどうかの判定。
 */
function containsKanjiNumber(text: string): boolean {
  return /[一二三四五六七八九十百千万億]/.test(text);
}

/**
 * 万・億を含む数値を「1万」「1億」形式に変換する。
 * 例: 「一万五千」→「1万5,000」、「一億八千万」→「1億8,000万」
 *
 * 万・億は「位取り単位」であり、直前の係数とセットで処理する。
 * 係数および万・億の直後に続く下位の数値（千以下の桁）は3桁ごとにカンマを付ける。
 */
function convertScaledNumber(kanjiNum: string): string {
  let result = "";
  let buffer = "";

  for (let i = 0; i < kanjiNum.length; i++) {
    const ch = kanjiNum[i]!;

    if (ch === "億" || ch === "万") {
      // 直前のバッファが係数。空の場合は「1」とする。
      // 係数も4桁（千）になり得るため、3桁ごとのカンマを付ける。
      const coeff = buffer ? kanjiToArabic(buffer) : "1";
      result += `${applyCommaToLowerDigits(coeff)}${ch}`;
      buffer = "";
    } else {
      buffer += ch;
    }
  }

  // バッファの残りは万・億より下位の桁
  if (buffer) {
    const lowerDigits = kanjiToArabic(buffer);
    result += applyCommaToLowerDigits(lowerDigits);
  }

  return result;
}

/**
 * 数値に3桁ごとのカンマを付ける。
 * 例: 「5000」→「5,000」、「800」→「800」（3桁未満はそのまま）
 */
function applyCommaToLowerDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 本文中の漢数字の数量表現を算用数字化する（設計書§4.2）。
 *
 * 万・億は単位文字を残し、3桁ごとにカンマを付ける。
 * 「十分の〜」形式の分数は formatFraction で処理するため、ここでは対象外。
 *
 * @param text 変換対象のテキスト
 * @returns 変換後のテキスト
 */
export function formatKanjiQuantity(text: string): string {
  if (!containsKanjiNumber(text)) return text;

  // 漢数字の連続をキャプチャ（万・億を含む）
  // ただし、直後に「種」「級」「条」「項」「号」「年」「回」「次」「類」「号」が続く場合は除外
  // これらは isKanjiNumberPart で事前除外するため、ここでは純粋な数量のみ処理
  const result = text.replace(
    /[一二三四五六七八九十百千万億]+/g,
    (match, _offset: number, _full: string) => {
      // 直前・直後の文脈で除外判定
      return convertScaledNumber(match);
    },
  );

  return result;
}

/**
 * 「十分の七」→「7/10」形式の分数変換（設計書§4.2）。
 *
 * パターン: <分母漢数字>分の<分子漢数字>
 * 分母・分子とも算用数字化し、分母が1000以上の場合はカンマを付ける。
 *
 * @param text 変換対象のテキスト
 * @returns 変換後のテキスト
 */
export function formatFraction(text: string): string {
  // <漢数字>分の<漢数字> パターンをマッチ
  const fractionPattern = /([一二三四五六七八九十百千万億]+)分の([一二三四五六七八九十百千万億]+)/g;

  return text.replace(fractionPattern, (_match, denomKanji: string, numerKanji: string) => {
    const denominator = kanjiToArabic(denomKanji);
    const numerator = kanjiToArabic(numerKanji);

    // 分母に3桁区切りカンマを付ける
    const denomStr = denominator.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${numerator}/${denomStr}`;
  });
}

/**
 * 変換除外パターン（設計書§4.3）。
 * これらの文脈では漢数字を算用数字化しない。
 *
 * 本文中の条・項参照（第二条、第二項等）は設計書§4.1の算用数字化対象なので除外しない。
 * 号番号・区分・等級・年号・公布番号のみ除外する。
 *
 * module scope で一度だけコンパイル（設計書§10）。
 */
const EXCLUSION_PATTERNS: readonly RegExp[] = Object.freeze([
  // 区分: 第一種、第二種等
  /第[一二三四五六七八九十]+種/,
  // 等級: 一級、二級等
  /[一二三四五六七八九十]+級/,
  // 号参照: 第N号、N号（号番号・公布番号）
  /第?[一二三四五六七八九十百]+号/,
  // 年号: 昭和NN年、平成NN年、令和NN年
  /(?:昭和|平成|令和)[一二三四五六七八九十]+年/,
  // 公布番号: 法律第NN号、政令第NN号、省令第NN号
  /(?:法律|政令|省令|告示|内閣令)第[一二三四五六七八九十百]+号/,
  // 回数: 第N回
  /第[一二三四五六七八九十]+回/,
]);

/**
 * 指定したテキストが変換除外パターンに一致するか判定する（設計書§4.3）。
 *
 * 除外判定は変換前のトークンで行う。該当するか不明な表現は変換しない。
 *
 * @param text 判定対象のテキスト
 * @returns true: 変換除外（漢数字を維持）、false: 変換対象
 */
export function isKanjiNumberPart(text: string): boolean {
  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * 構造化番号（条・項・号の番号）を算用数字化する（設計書§4.1）。
 *
 * articleNumber、paragraphNumber 等の構造化フィールド値専用。
 * 「の」区切りも変換する（例: 「一の二」→「1の2」）。
 * 万・億・カンマは使わない（構造化番号は小さい値のため）。
 * 全角数字も半角化する（kanjiToArabic が処理）。
 *
 * @param num 構造化番号文字列（null/undefined可）
 * @returns 算用数字化された文字列
 */
export function formatStructuredNumber(num: string | null | undefined): string | null | undefined {
  if (num == null) return num;
  if (num === "") return num;

  // 全体を kanjiToArabic に通すことで、漢数字・全角数字を一括で半角算用数字に変換する。
  // kanjiToArabic は漢数字・全角数字を含まない文字列はそのまま返す。
  // ただし「の」区切りの十以上の漢数字（「十二」等）も正しく処理される。
  return num
    .split("の")
    .map((part) => kanjiToArabic(part))
    .join("の");
}
