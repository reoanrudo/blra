/**
 * 原文レイアウトを保つ表セル用の表示整形。
 *
 * 通常の表セルと異なり、改行や字面を保つ必要があるため最小限の変換だけを行う。
 */
export function formatRawTableCellText(text: string): string {
  let result = text.replace(/（/g, "(").replace(/）/g, ")");

  // 法令番号は年・号数を算用数字化する。一方、通常の「第一号」等は区分なので維持する。
  result = result.replace(
    /([明治大正昭和平成令和])([一二三四五六七八九十百千零〇]+)年([^\s第（）()、。]*?(?:法律|政令|勅令|内閣令|省令|府令|庁令|告示|布告|規則))第([一二三四五六七八九十百千零〇]+)号/g,
    (_match, era: string, year: string, lawType: string, number: string) =>
      `${era}${kanjiToNumber(year)}年${lawType}第${kanjiToNumber(number)}号`,
  );

  // 条・項等は数字化し、号番号は漢数字を維持する。
  result = result.replace(
    /第([一二三四五六七八九十百千零〇]+)(条|項|章|節|款|編|部)/g,
    (_match, number: string, unit: string) => `第${kanjiToNumber(number)}${unit}`,
  );

  result = result.replace(
    /\(([一二三四五六七八九十百零〇]+(?:の[一二三四五六七八九十百零〇]+)?)\)/g,
    (_match, number: string) =>
      `(${number.split("の").map((part) => String(kanjiToNumber(part))).join("の")})`,
  );

  const decimalDigits: Record<string, string> = {
    "〇": "0", "零": "0", "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
    "六": "6", "七": "7", "八": "8", "九": "9",
  };
  result = result.replace(
    /([〇零一二三四五六七八九])[・.]([〇零一二三四五六七八九]+)/g,
    (_match, integer: string, decimal: string) =>
      `${decimalDigits[integer] ?? "0"}.${decimal.split("").map((digit) => decimalDigits[digit] ?? digit).join("")}`,
  );

  result = result.replace(
    /([一二三四五六七八九十百零〇]+)階/g,
    (_match, number: string) => `${kanjiToNumber(number)}階`,
  );

  for (const [from, to] of [
    ["平方メートル", "m²"], ["立方メートル", "m³"], ["ミリメートル", "mm"],
    ["センチメートル", "cm"], ["キロワット", "kW"], ["リットル", "L"], ["メートル", "m"],
  ] as const) {
    result = result.replaceAll(from, to);
  }

  return result.replace(
    /([一二三四五六七八九十百千万零〇・]+)(m²|m³|kW|L|m)/g,
    (_match, number: string, unit: string) => {
      if (number.includes("・")) {
        const [integer, decimal] = number.split("・");
        return `${kanjiToNumber(integer)}.${decimal.split("").map((digit) => decimalDigits[digit] ?? digit).join("")}${unit}`;
      }
      const value = kanjiToNumber(number);
      if (value >= 10000) {
        const man = value / 10000;
        return `${Number.isInteger(man) ? man : man.toFixed(1)}万${unit}`;
      }
      return `${value}${unit}`;
    },
  );
}

function kanjiToNumber(kanji: string): number {
  const parts = kanji.split("万");
  if (parts.length === 2) {
    return parseKanjiSmall(parts[0] || "一") * 10000 + parseKanjiSmall(parts[1] || "");
  }
  return parseKanjiSmall(kanji);
}

function parseKanjiSmall(kanji: string): number {
  const digits: Record<string, number> = {
    "零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9,
  };
  const units: Record<string, number> = { "十": 10, "百": 100, "千": 1000 };
  let result = 0;
  let current = 0;
  for (const character of kanji) {
    if (digits[character] !== undefined) current = digits[character];
    else if (units[character] !== undefined) {
      result += (current || 1) * units[character];
      current = 0;
    }
  }
  return result + current;
}
