/**
 * 法令本文の原文→表示トークン列変換の中核（設計書§3）。
 *
 * 原文（Article.text）を入力とし、表示用トークン列（LegalDisplayToken[]）を出力する。
 * 各トークンは原文上の位置（sourceStart/sourceEnd）を保持するため、
 * 表示後もリンク範囲・ハイライト範囲を原文座標で管理できる。
 *
 * 処理順序（設計書§4）:
 * 1. 除外判定（§4.3）: 区分・等級・号構造・公布番号等は原文維持
 * 2. 分数変換（§4.2）: 「十分の七」→「7/10」
 * 3. 単位変換（§4.4）: 複合単位を先に、次に単独単位
 * 4. 数量変換（§4.2）: 残った漢数字の数量を算用数字化
 *
 * すべて純粋関数・DBアクセスなし（設計書§10）。
 */

import { findUnitMatch } from "@/lib/article/legal-unit-dictionary";
import {
  formatFraction,
  formatKanjiQuantity,
  isKanjiNumberPart,
} from "@/lib/article/legal-number-format";
import { kanjiToArabic } from "@/lib/article/normalize-article";

/**
 * 表示トークン（設計書§3）。
 *
 * sourceStart/sourceEnd は原文上の文字オフセット。
 * displayText は画面に表示される文字列。
 * kind は変換の種類を示す。
 */
export interface LegalDisplayToken {
  /** 原文上の開始位置（0ベース、このトークンの先頭文字） */
  sourceStart: number;
  /** 原文上の終了位置（このトークンの最後の文字の次） */
  sourceEnd: number;
  /** 表示用テキスト */
  displayText: string;
  /** トークンの種類 */
  kind: "plain" | "number" | "unit" | "fraction";
  /** kind === "fraction" のときの分子（算用数字文字列） */
  fractionNumerator?: string;
  /** kind === "fraction" のときの分母（算用数字文字列・カンマ付き） */
  fractionDenominator?: string;
}

/**
 * 漢数字の文字クラス（判定用）。
 */
const KANJI_NUMBER_CHARS = /[一二三四五六七八九十百千万億]/;

/**
 * 除外すべき漢数字シーケンスの直前のコンテキスト長。
 * 「第」「昭和」等の先行語を含めて判定するため、前方を少し参照する。
 */
const EXCLUSION_LOOKBEHIND = 4;

/**
 * 除外すべき漢数字シーケンスの直後のコンテキスト長。
 * 「種」「級」「条」「項」「号」「年」等の後続語を含めて判定するため、後方を少し参照する。
 */
const EXCLUSION_LOOKAHEAD = 4;

/**
 * 原文全体を表示トークン列へ変換する（設計書§3）。
 *
 * 原文を走査し、以下の順で変換を適用する:
 * 1. 除外パターンに一致する漢数字シーケンス → plain（原文維持）
 * 2. 単位辞書にマッチする部分 → unit
 * 3. 分数パターンに一致する部分 → fraction
 * 4. それ以外の漢数字シーケンス → number（算用数字化）
 *
 * 変換できない文字列は原文トークンとして返す（設計書§9）。
 *
 * @param text 原文テキスト（Article.text）
 * @returns 表示トークン列（空文字の場合は空配列）
 */
export function formatLegalText(text: string): LegalDisplayToken[] {
  if (!text || text.length === 0) return [];

  const tokens: LegalDisplayToken[] = [];
  let pos = 0;

  while (pos < text.length) {
    const ch = text[pos]!;

    // 漢数字でない場合
    if (!KANJI_NUMBER_CHARS.test(ch)) {
      // まずこの位置から単位が始まるか確認（「平方メートル」等）
      const unitMatch = findUnitMatch(text, pos);
      if (unitMatch) {
        tokens.push({
          sourceStart: unitMatch.start,
          sourceEnd: unitMatch.end,
          displayText: unitMatch.to,
          kind: "unit",
        });
        pos = unitMatch.end;
        continue;
      }

      // plain トークンとして進める（次の漢数字 or 単位の開始位置まで）
      const start = pos;
      pos++;
      while (pos < text.length) {
        if (KANJI_NUMBER_CHARS.test(text[pos]!)) break;
        if (findUnitMatch(text, pos)) break;
        pos++;
      }
      tokens.push({
        sourceStart: start,
        sourceEnd: pos,
        displayText: text.slice(start, pos),
        kind: "plain",
      });
      continue;
    }

    // 漢数字シーケンスの開始位置
    const seqStart = pos;

    // まず単位がこの位置から始まるか確認（「一立方メートル…」等の複合単位の「一」を含む）
    const unitMatch = findUnitMatch(text, pos);
    if (unitMatch) {
      tokens.push({
        sourceStart: unitMatch.start,
        sourceEnd: unitMatch.end,
        displayText: unitMatch.to,
        kind: "unit",
      });
      pos = unitMatch.end;
      continue;
    }

    // 漢数字シーケンスを延ばす
    while (pos < text.length && KANJI_NUMBER_CHARS.test(text[pos]!)) {
      pos++;
    }
    const seqEnd = pos;

    // 分数パターンの判定（「十分の七」等）
    // シーケンスの直後に「分の」が続き、さらに漢数字が続く場合
    const fractionMatch = matchFractionAt(text, seqStart);
    if (fractionMatch) {
      tokens.push({
        sourceStart: fractionMatch.sourceStart,
        sourceEnd: fractionMatch.sourceEnd,
        displayText: fractionMatch.displayText,
        kind: "fraction",
        fractionNumerator: fractionMatch.numerator,
        fractionDenominator: fractionMatch.denominator,
      });
      pos = fractionMatch.sourceEnd;
      continue;
    }

    // 除外判定: 前後のコンテキストを含めて判定（設計書§4.3）
    const contextStart = Math.max(0, seqStart - EXCLUSION_LOOKBEHIND);
    const contextEnd = Math.min(text.length, seqEnd + EXCLUSION_LOOKAHEAD);
    const context = text.slice(contextStart, contextEnd);

    if (isKanjiNumberPart(context)) {
      // 除外: 原文のまま表示
      tokens.push({
        sourceStart: seqStart,
        sourceEnd: seqEnd,
        displayText: text.slice(seqStart, seqEnd),
        kind: "plain",
      });
      continue;
    }

    // 数量変換
    const formatted = formatKanjiQuantity(text.slice(seqStart, seqEnd));
    tokens.push({
      sourceStart: seqStart,
      sourceEnd: seqEnd,
      displayText: formatted,
      kind: "number",
    });
  }

  // 隣接する plain トークンを結合（最適化）
  return mergeAdjacentPlainTokens(tokens);
}

/**
 * 分数パターン「<分母>分の<分子>」のマッチ。
 * 指定位置から始まる分数表現を検索する。
 * 縦表示レンダリングのため、分子・分母の算用数字文字列も併せて返す。
 */
function matchFractionAt(
  text: string,
  pos: number,
): {
  sourceStart: number;
  sourceEnd: number;
  displayText: string;
  numerator: string;
  denominator: string;
} | null {
  // <漢数字>分の<漢数字> パターン
  const fractionPattern = /^([一二三四五六七八九十百千万億]+)分の([一二三四五六七八九十百千万億]+)/;
  const remaining = text.slice(pos);
  const match = remaining.match(fractionPattern);
  if (!match) return null;

  const fullMatch = match[0];
  const denomKanji = match[1]!;
  const numerKanji = match[2]!;
  const denominator = kanjiToArabic(denomKanji).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const numerator = kanjiToArabic(numerKanji);

  return {
    sourceStart: pos,
    sourceEnd: pos + fullMatch.length,
    displayText: formatFraction(fullMatch),
    numerator,
    denominator,
  };
}

/**
 * 隣接する plain トークンを結合してトークン数を削減する。
 */
function mergeAdjacentPlainTokens(tokens: LegalDisplayToken[]): LegalDisplayToken[] {
  if (tokens.length <= 1) return tokens;

  const result: LegalDisplayToken[] = [];
  for (const token of tokens) {
    const last = result[result.length - 1];
    if (last && last.kind === "plain" && token.kind === "plain" && last.sourceEnd === token.sourceStart) {
      last.sourceEnd = token.sourceEnd;
      last.displayText += token.displayText;
    } else {
      result.push({ ...token });
    }
  }
  return result;
}

/**
 * 原文範囲から表示文字列へ変換する（設計書§6.1, §6.2）。
 *
 * 指定された原文位置範囲と交差するすべてのトークンの表示文字列を結合して返す。
 * 置換トークンの一部と交差した場合は、トークン全体を含める（設計書§6.2）。
 *
 * @param tokens 表示トークン列
 * @param sourceStart 原文の開始位置
 * @param sourceEnd 原文の終了位置
 * @returns 表示文字列
 */
export function sourceToDisplay(
  tokens: LegalDisplayToken[],
  sourceStart: number,
  sourceEnd: number,
): string {
  let result = "";
  for (const token of tokens) {
    // トークンが範囲と交差するか
    if (token.sourceEnd <= sourceStart || token.sourceStart >= sourceEnd) {
      continue;
    }
    result += token.displayText;
  }
  return result;
}

/**
 * 表示位置から原文範囲へ変換する（設計書§6.3）。
 *
 * 表示文字列上の開始・終了位置から、対応する原文の sourceStart/sourceEnd を復元する。
 * トークンの一部が選択された場合は、そのトークン全体の原文範囲を返す。
 *
 * @param tokens 表示トークン列
 * @param displayStart 表示文字列の開始位置
 * @param displayEnd 表示文字列の終了位置
 * @returns 原文の範囲（見つからない場合は null）
 */
export function displayToSource(
  tokens: LegalDisplayToken[],
  displayStart: number,
  displayEnd: number,
): { start: number; end: number } | null {
  let offset = 0;
  let sourceStart: number | null = null;
  let sourceEnd: number | null = null;

  for (const token of tokens) {
    const tokenDisplayStart = offset;
    const tokenDisplayEnd = offset + token.displayText.length;

    // 選択範囲がこのトークンと交差するか
    const intersects =
      tokenDisplayEnd > displayStart && tokenDisplayStart < displayEnd;

    if (intersects) {
      if (sourceStart === null) {
        sourceStart = token.sourceStart;
      }
      sourceEnd = token.sourceEnd;
    }

    offset = tokenDisplayEnd;
  }

  if (sourceStart === null || sourceEnd === null) return null;
  return { start: sourceStart, end: sourceEnd };
}
