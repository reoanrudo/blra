/**
 * Article number normalization utilities.
 * Extracted from scripts/ingest.ts for runtime link detection use.
 */

export function kanjiToArabic(kanji: string): string {
  let s = kanji.replace(/[０-９]/g, (c) =>
    String(c.codePointAt(0)! - "０".codePointAt(0)!),
  );

  // 「〇・七五」等の小数表記 → 「0.75」
  if (/[〇零一二三四五六七八九][・.][〇零一二三四五六七八九]/.test(s)) {
    const decMap: Record<string, string> = {
      "〇": "0", "零": "0", "一": "1", "二": "2", "三": "3",
      "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
    };
    s = s.replace(/([〇零一二三四五六七八九]*)[・.]([〇零一二三四五六七八九]+)/g,
      (_m, intPart: string, decPart: string) => {
        const intStr = intPart ? (decMap[intPart] ?? "0") : "0";
        const decStr = decPart.split("").map((ch: string) => decMap[ch] ?? ch).join("");
        return `${intStr}.${decStr}`;
      },
    );
  }

  if (/[一二三四五六七八九十百千万]/.test(s)) {
    // 「万」で分割して処理
    const manParts = s.split("万");
    if (manParts.length === 2) {
      const upper = parseKanjiNum(manParts[0] || "一");
      const lower = parseKanjiNum(manParts[1] || "");
      s = String(upper * 10000 + lower);
    } else {
      s = String(parseKanjiNum(s));
    }
  }

  return s;
}

function parseKanjiNum(s: string): number {
  if (!/[一二三四五六七八九十百千]/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }
  // 単位（十百千万）を含まない純粋な桁並び（「二五」「一二五」等）は
  // 桁接続として処理: 二五→25、一二五→125
  if (!/[十百千万]/.test(s)) {
    const digitMap: Record<string, number> = {
      "零": 0, "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
      "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
    };
    let digits = "";
    let allDigits = true;
    for (const ch of s) {
      if (digitMap[ch] !== undefined) {
        digits += digitMap[ch];
      } else if (/[0-9]/.test(ch)) {
        digits += ch;
      } else {
        allDigits = false;
        break;
      }
    }
    if (allDigits && digits.length > 0) {
      return parseInt(digits, 10);
    }
  }
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
    } else if (/[0-9]/.test(ch)) {
      current = parseInt(ch, 10);
    }
  }
  result += current;
  return result;
}

export function normalizeArticleNumber(
  num: string | undefined,
): string | undefined {
  if (!num) return undefined;
  return num.split("の").map(kanjiToArabic).join("の");
}
