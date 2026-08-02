import { describe, it, expect } from "vitest";
import {
  formatKanjiQuantity,
  formatFraction,
  formatStructuredNumber,
  isKanjiNumberPart,
} from "@/lib/article/legal-number-format";

describe("legal-number-format（設計書§4.2, §4.3）", () => {
  describe("formatKanjiQuantity", () => {
    it("「一万五千」を「1万5,000」に変換する", () => {
      expect(formatKanjiQuantity("一万五千")).toBe("1万5,000");
    });

    it("「一億八千万」を「1億8,000万」に変換する", () => {
      expect(formatKanjiQuantity("一億八千万")).toBe("1億8,000万");
    });

    it("「十平方メートル」の「十」を「10」に変換する", () => {
      expect(formatKanjiQuantity("十平方メートル")).toBe("10平方メートル");
    });

    it("「二百キロメートル」の「二百」を「200」に変換する", () => {
      expect(formatKanjiQuantity("二百キロメートル")).toBe("200キロメートル");
    });

    it("「三メートル」の「三」を「3」に変換する", () => {
      expect(formatKanjiQuantity("三メートル")).toBe("3メートル");
    });

    it("「五千」を「5,000」に変換する（カンマ区切り）", () => {
      expect(formatKanjiQuantity("五千")).toBe("5,000");
    });

    it("「百二十」を「120」に変換する", () => {
      expect(formatKanjiQuantity("百二十")).toBe("120");
    });

    it("文脈内の複数の数量を変換する", () => {
      const result = formatKanjiQuantity("面積は一万五千平方メートルである");
      expect(result).toBe("面積は1万5,000平方メートルである");
    });

    it("漢数字を含まないテキストはそのまま返す", () => {
      expect(formatKanjiQuantity("建築物の敷地")).toBe("建築物の敷地");
    });

    it("すでに算用数字のテキストはそのまま返す", () => {
      expect(formatKanjiQuantity("面積は500m²")).toBe("面積は500m²");
    });
  });

  describe("formatFraction", () => {
    it("「十分の七」を「7/10」に変換する", () => {
      expect(formatFraction("十分の七")).toBe("7/10");
    });

    it("「十分の三」を「3/10」に変換する", () => {
      expect(formatFraction("十分の三")).toBe("3/10");
    });

    it("「百分の一」を「1/100」に変換する", () => {
      expect(formatFraction("百分の一")).toBe("1/100");
    });

    it("「千分の五」を「5/1,000」に変換する", () => {
      expect(formatFraction("千分の五")).toBe("5/1,000");
    });

    it("分数表現を含まないテキストはそのまま返す", () => {
      expect(formatFraction("建築物の敷地")).toBe("建築物の敷地");
    });

    it("文脈内の分数を変換する", () => {
      const result = formatFraction("その割合は十分の七以上とする");
      expect(result).toBe("その割合は7/10以上とする");
    });
  });

  describe("isKanjiNumberPart（設計書§4.3 除外判定）", () => {
    it("「第一種」は除外される（区分）", () => {
      expect(isKanjiNumberPart("第一種")).toBe(true);
    });

    it("「第二種」は除外される（区分）", () => {
      expect(isKanjiNumberPart("第二種")).toBe(true);
    });

    it("「第三種」は除外される（区分）", () => {
      expect(isKanjiNumberPart("第三種")).toBe(true);
    });

    it("「一級」は除外される（等級）", () => {
      expect(isKanjiNumberPart("一級")).toBe(true);
    });

    it("「二級」は除外される（等級）", () => {
      expect(isKanjiNumberPart("二級")).toBe(true);
    });

    it("「第十条」は除外されない（本文中の条参照は算用数字化対象）", () => {
      expect(isKanjiNumberPart("第十条")).toBe(false);
    });

    it("「第二条の二」は除外されない（本文中の条参照）", () => {
      expect(isKanjiNumberPart("第二条の二")).toBe(false);
    });

    it("「第二項」は除外されない（本文中の項参照は算用数字化対象）", () => {
      expect(isKanjiNumberPart("第二項")).toBe(false);
    });

    it("「昭和四十八年」は除外される（年号）", () => {
      expect(isKanjiNumberPart("昭和四十八年")).toBe(true);
    });

    it("「法律第七十二号」は除外される（公布番号）", () => {
      expect(isKanjiNumberPart("法律第七十二号")).toBe(true);
    });

    it("「一万」は除外されない（数量）", () => {
      expect(isKanjiNumberPart("一万")).toBe(false);
    });

    it("「五千平方メートル」は除外されない（数量）", () => {
      expect(isKanjiNumberPart("五千平方メートル")).toBe(false);
    });

    it("「三メートル」は除外されない（数量）", () => {
      expect(isKanjiNumberPart("三メートル")).toBe(false);
    });
  });

  describe("formatStructuredNumber（設計書§4.1）", () => {
    it("「九」を「9」に変換する", () => {
      expect(formatStructuredNumber("九")).toBe("9");
    });

    it("「二」を「2」に変換する", () => {
      expect(formatStructuredNumber("二")).toBe("2");
    });

    it("「の二」を「の2」に変換する（条の番号）", () => {
      expect(formatStructuredNumber("の二")).toBe("の2");
    });

    it("「一の二」を「1の2」に変換する", () => {
      expect(formatStructuredNumber("一の二")).toBe("1の2");
    });

    it("「四十八」を「48」に変換する", () => {
      expect(formatStructuredNumber("四十八")).toBe("48");
    });

    it("「百二十」を「120」に変換する", () => {
      expect(formatStructuredNumber("百二十")).toBe("120");
    });

    it("算用数字のみの文字列はそのまま返す", () => {
      expect(formatStructuredNumber("9")).toBe("9");
    });

    it("null/undefined はそのまま返す", () => {
      expect(formatStructuredNumber(null)).toBeNull();
      expect(formatStructuredNumber(undefined)).toBeUndefined();
    });

    it("空文字はそのまま返す", () => {
      expect(formatStructuredNumber("")).toBe("");
    });

    it("全角数字を半角化する", () => {
      expect(formatStructuredNumber("１")).toBe("1");
      expect(formatStructuredNumber("２")).toBe("2");
    });

    it("記号付き番号はそのまま返す（カッコ等）", () => {
      expect(formatStructuredNumber("(1)")).toBe("(1)");
      expect(formatStructuredNumber("(i)")).toBe("(i)");
      expect(formatStructuredNumber("a")).toBe("a");
    });
  });
});
