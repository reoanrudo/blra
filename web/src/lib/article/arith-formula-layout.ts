export interface ArithFormulaLayout {
  introduction: string;
  introductionStart: number;
  formula: string;
  formulaStart: number;
  definitions: string;
  definitionsStart: number;
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
    !definitionLines[0]!.startsWith("(") ||
    !definitionLines[0]!.includes("この式において、") ||
    !definitionLines.at(-1)!.endsWith(")")
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
    .slice(1, -1)
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
