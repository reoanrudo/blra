/**
 * Article number normalization utilities.
 * Extracted from scripts/ingest.ts for runtime link detection use.
 */

export function kanjiToArabic(kanji: string): string {
  let s = kanji.replace(/[０-９]/g, (c) =>
    String(c.codePointAt(0)! - "０".codePointAt(0)!),
  );

  if (/[一二三四五六七八九十百千]/.test(s)) {
    let result = 0;
    let current = 0;
    for (const ch of s) {
      if (ch === "千") {
        result += (current || 1) * 1000;
        current = 0;
      } else if (ch === "百") {
        result += (current || 1) * 100;
        current = 0;
      } else if (ch === "十") {
        result += (current || 1) * 10;
        current = 0;
      } else if (ch === "一") {
        current = 1;
      } else if (ch === "二") {
        current = 2;
      } else if (ch === "三") {
        current = 3;
      } else if (ch === "四") {
        current = 4;
      } else if (ch === "五") {
        current = 5;
      } else if (ch === "六") {
        current = 6;
      } else if (ch === "七") {
        current = 7;
      } else if (ch === "八") {
        current = 8;
      } else if (ch === "九") {
        current = 9;
      } else {
        return s;
      }
    }
    result += current;
    s = String(result);
  }

  return s;
}

export function normalizeArticleNumber(
  num: string | undefined,
): string | undefined {
  if (!num) return undefined;
  return num.split("の").map(kanjiToArabic).join("の");
}
