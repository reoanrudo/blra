export interface ArithFormulaLayout {
  introduction: string;
  introductionStart: number;
  formula: string;
  formulaStart: number;
  definitions: string;
  definitionsStart: number;
}

/**
 * 算術式を左辺・分子・分母に分割する。
 *
 * 法令XMLの `<Sub>` は `_` に変換されているため、`Ａ_ｆ` は「Aの下付きf」を表す。
 * `／`（全角スラッシュ U+FF0F）で割り算を表す。
 *
 * 例:
 *   "Ａ_ｖ＝Ａ_ｆ／（２５０√ｈ）"
 *     → { leftSide: "Ａ_ｖ", numerator: "Ａ_ｆ", denominator: "２５０√ｈ" }
 *
 *   "Ｖ＝２０Ａ_ｆ／Ｎ"
 *     → { leftSide: "Ｖ", numerator: "２０Ａ_ｆ", denominator: "Ｎ" }
 *
 * ／ が1つの場合のみ分数化する。
 * ／ が0個または2個以上の場合は null（従来の1行表示にフォールバック）。
 */
export interface FormulaFraction {
  /** 等号の左辺（例: "Ａ_ｖ"） */
  leftSide: string;
  /** 分子（／ の前、右辺の前半） */
  numerator: string;
  /** 分母（／ の後ろ、外側の括弧を外したもの） */
  denominator: string;
}

export function splitFormulaFraction(formula: string): FormulaFraction | null {
  // ／ は全角のみ（半角化されない）。/ は数字分数で別用途のため除外。
  const slashCount = (formula.match(/／/g) ?? []).length;
  if (slashCount !== 1) return null;

  // = は半角・全角両方に対応（displayText は半角化されている）
  const eqMatch = formula.match(/[=＝]/);
  if (!eqMatch || eqMatch.index == null) return null;
  const eqIndex = eqMatch.index;

  const leftSide = formula.slice(0, eqIndex);
  const rightSide = formula.slice(eqIndex + 1);

  const slashIndex = rightSide.indexOf("／");
  if (slashIndex < 0) return null;

  let numerator = rightSide.slice(0, slashIndex);
  let denominator = rightSide.slice(slashIndex + 1);

  // 外側の括弧（全角（）、半角()）を外す
  numerator = unwrapParens(numerator);
  denominator = unwrapParens(denominator);

  numerator = numerator.trim();
  denominator = denominator.trim();

  if (!numerator || !denominator) return null;

  return { leftSide: leftSide.trim(), numerator, denominator };
}

/**
 * 文字列の先頭と末尾が括弧（全角（）、半角()）で囲まれている場合、
 * 外側の括弧を1組だけ外す。
 * "(250√h)" → "250√h"
 * "（２５０√ｈ）" → "２５０√ｈ"
 * "20A_f" → "20A_f"（そのまま）
 */
function unwrapParens(s: string): string {
  const trimmed = s.trim();
  const openChars = ["（", "("];
  const closeChars = ["）", ")"];
  if (trimmed.length < 2) return trimmed;

  const startsWithOpen = openChars.includes(trimmed[0]!);
  const endsWithClose = closeChars.includes(trimmed[trimmed.length - 1]!);
  if (!startsWithOpen || !endsWithClose) return trimmed;

  // 括弧のバランスを確認して、最初の開き括弧と最後の閉じ括弧が対応している場合のみ外す
  let depth = 0;
  let balanced = true;
  for (let i = 0; i < trimmed.length; i++) {
    if (openChars.includes(trimmed[i]!)) depth++;
    else if (closeChars.includes(trimmed[i]!)) depth--;
    if (depth === 0 && i < trimmed.length - 1) {
      balanced = false;
      break;
    }
  }
  if (balanced && depth === 0) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * 「次の式」に続く算式と、その記号説明を法令集の組版用に分離する。
 * 定義部分は外側の括弧を除いて返し、表示側で高さに合わせた括弧を付ける。
 */
export function splitArithFormulaLayout(text: string): ArithFormulaLayout | null {
  const lines = text.split("\n");
  const formulaLineIndex = lines.findIndex(
    (line) => /[=＝]/.test(line) && line.trim().length > 0,
  );
  if (formulaLineIndex < 1) return null;

  const definitionStartLine = formulaLineIndex + 1;
  const definitionLines = lines.slice(definitionStartLine);
  if (
    definitionLines.length === 0 ||
    !(definitionLines[0]!.startsWith("(") || definitionLines[0]!.startsWith("（")) ||
    !definitionLines[0]!.includes("この式において、") ||
    !(definitionLines.at(-1)!.endsWith(")") || definitionLines.at(-1)!.endsWith("）"))
  ) {
    return null;
  }

  const introduction = lines.slice(0, formulaLineIndex).join("\n").trimEnd();
  const formula = lines[formulaLineIndex]!.trim();
  if (!introduction || !formula) return null;

  const formulaStart = text.indexOf(formula);
  const definitionsStart = formulaStart + formula.length + 2;
  const definitions = definitionLines
    .join("\n")
    .replace(/^[（(]/, "")
    .replace(/[）)]$/, "")
    .trim();
  if (!definitions) return null;

  return {
    introduction,
    introductionStart: 0,
    formula,
    formulaStart,
    definitions,
    definitionsStart,
  };
}
