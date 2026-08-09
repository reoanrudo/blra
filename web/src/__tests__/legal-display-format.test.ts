import { describe, it, expect } from "vitest";
import {
  formatLegalText,
  sourceToDisplay,
  displayToSource,
  type LegalDisplayToken,
} from "@/lib/article/legal-display-format";

describe("legal-display-format（設計書§3, §4）", () => {
  describe("formatLegalText: 基本変換", () => {
    it("漢数字を含まないテキストは単一の plain トークンになる", () => {
      const tokens = formatLegalText("建築物の敷地");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        sourceStart: 0,
        sourceEnd: 6,
        displayText: "建築物の敷地",
        kind: "plain",
      });
    });

    it("空文字列は空配列を返す", () => {
      expect(formatLegalText("")).toEqual([]);
    });
  });

  describe("formatLegalText: 数量変換（設計書§4.2）", () => {
    it("「一万五千平方メートル」を変換する", () => {
      const tokens = formatLegalText("一万五千平方メートル");
      // 数量トークン + 単位トークン + plain の組合せ
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("1万5,000m²");
    });

    it("「十平方メートル」を変換する", () => {
      const tokens = formatLegalText("十平方メートル");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("10m²");
    });

    it("「三メートル」を変換する", () => {
      const tokens = formatLegalText("三メートル");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("3m");
    });
  });

  describe("formatLegalText: 小数変換（設計書§4.2）", () => {
    it("「三・〇」を原文座標付きの単一数値トークンへ変換する", () => {
      expect(formatLegalText("三・〇")).toEqual([
        {
          sourceStart: 0,
          sourceEnd: 3,
          displayText: "3.0",
          kind: "number",
        },
      ]);
    });

    it("小数部の先頭と末尾の〇を保持して変換する", () => {
      const tokens = formatLegalText("〇・〇〇三");
      expect(tokens.map((token) => token.displayText).join("")).toBe("0.003");
    });

    it("文中の漢数字小数を変換する", () => {
      const tokens = formatLegalText("数値に三・〇を乗じる");
      expect(tokens.map((token) => token.displayText).join("")).toBe(
        "数値に3.0を乗じる",
      );
    });

    it("文中で〇から始まる漢数字小数を変換する", () => {
      const tokens = formatLegalText("数値に〇・七を乗じる");
      expect(tokens.map((token) => token.displayText).join("")).toBe(
        "数値に0.7を乗じる",
      );
    });

    it.each([
      ["二十・五パーセント以上", "20.5%以上"],
      ["百二十・五", "120.5"],
      ["三・〇パーセント", "3.0%"],
      ["〇・〇〇五ミリグラム", "0.005mg"],
      ["一万二千三百四十五・六七", "1万2,345.67"],
    ])("複数桁を含む漢数字小数 %s を %s へ変換する", (source, expected) => {
      expect(formatLegalText(source).map((token) => token.displayText).join(""))
        .toBe(expected);
    });

    it("複数桁小数を原文範囲付きの単一数値トークンにする", () => {
      expect(formatLegalText("二十・五")).toEqual([
        {
          sourceStart: 0,
          sourceEnd: 4,
          displayText: "20.5",
          kind: "number",
        },
      ]);
    });

    it("数値でない中点は変換しない", () => {
      const tokens = formatLegalText("A・B");
      expect(tokens.map((token) => token.displayText).join("")).toBe("A・B");
    });
  });

  describe("formatLegalText: 分数変換（設計書§4.2）", () => {
    it("「十分の七」を「7/10」に変換する", () => {
      const tokens = formatLegalText("十分の七");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("7/10");
    });

    it("文脈内の分数を変換する", () => {
      const tokens = formatLegalText("割合は十分の七以上");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("割合は7/10以上");
    });

    it("fraction トークンに分子・分母の構造情報を設定する", () => {
      const tokens = formatLegalText("十分の七");
      const fractionToken = tokens.find((t) => t.kind === "fraction");
      expect(fractionToken).toBeDefined();
      expect(fractionToken!.fractionNumerator).toBe("7");
      expect(fractionToken!.fractionDenominator).toBe("10");
    });

    it("文脈内の分数も構造情報を保持する", () => {
      const tokens = formatLegalText("割合は十分の七以上");
      const fractionToken = tokens.find((t) => t.kind === "fraction");
      expect(fractionToken).toBeDefined();
      expect(fractionToken!.fractionNumerator).toBe("7");
      expect(fractionToken!.fractionDenominator).toBe("10");
    });
  });

  describe("formatLegalText: 単位変換（設計書§4.4）", () => {
    it("「キログラム」を「kg」に変換する（直前に数量あり）", () => {
      const tokens = formatLegalText("質量は5キログラム");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("質量は5kg");
    });

    it("単独単位は直前に数量がない場合は変換しない（設計書§4.4）", () => {
      // 「プログラム」の「グラム」は変換しない
      const tokens = formatLegalText("プログラム");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("プログラム");
    });

    it("複合単位「一立方メートルにつきキログラム」を「kg/m³」に変換する", () => {
      const tokens = formatLegalText("一立方メートルにつきキログラム");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("kg/m³");
    });

    it("文章中の立方メートル毎時を一つの単位トークンへ変換する", () => {
      const source = "有効換気量(立方メートル毎時で表した量とする。)";
      const tokens = formatLegalText(source);
      expect(tokens.map((token) => token.displayText).join("")).toBe(
        "有効換気量(m³/時間で表した量とする。)",
      );
      expect(tokens.find((token) => token.displayText === "m³/時間"))
        .toMatchObject({ kind: "unit" });
    });

    it("時間語が先にある文章は語順を変えない", () => {
      expect(formatLegalText("毎時十四立方メートル").map((token) => token.displayText).join(""))
        .toBe("毎時14m³");
    });
  });

  describe("formatLegalText: 除外判定（設計書§4.3）", () => {
    it("「第一種」の漢数字は変換しない", () => {
      const tokens = formatLegalText("第一種低層住居専用地域");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("第一種低層住居専用地域");
    });

    it("「一級」の漢数字は変換しない", () => {
      const tokens = formatLegalText("一級建築士");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("一級建築士");
    });

    it("「第二条」の条文参照は算用数字化する", () => {
      const tokens = formatLegalText("第二条の規定により");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("第2条の規定により");
    });

    it("「第二項」の項参照は算用数字化する", () => {
      const tokens = formatLegalText("第二項の規定");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("第2項の規定");
    });

    it("「法律第七十二号」の公布番号は変換しない", () => {
      const tokens = formatLegalText("昭和四十八年法律第七十二号");
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe("昭和四十八年法律第七十二号");
    });
  });

  describe("formatLegalText: 複合変換", () => {
    it("除外表現と数量表現が混在するテキストを正しく変換する", () => {
      const tokens = formatLegalText(
        "第一種住居専用地域において面積が五百平方メートル以上の建築物",
      );
      const displayText = tokens.map((t) => t.displayText).join("");
      expect(displayText).toBe(
        "第一種住居専用地域において面積が500m²以上の建築物",
      );
    });
  });

  describe("formatLegalText: トークンの整合性（設計書§3）", () => {
    it("すべてのトークンが有効な公式原文範囲を持つ", () => {
      const original = "面積は一万平方メートル以上とする";
      const tokens = formatLegalText(original);

      for (const token of tokens) {
        expect(token.sourceStart).toBeGreaterThanOrEqual(0);
        expect(token.sourceEnd).toBeLessThanOrEqual(original.length);
        expect(token.sourceStart).toBeLessThan(token.sourceEnd);
      }
    });

    it("トークンが隣接している（隙間がない）", () => {
      const original = "面積は一万平方メートル以上とする";
      const tokens = formatLegalText(original);

      for (let i = 0; i < tokens.length; i++) {
        if (i > 0) {
          expect(tokens[i]!.sourceStart).toBe(tokens[i - 1]!.sourceEnd);
        }
      }
    });

    it("最初のトークンはsourceStart=0", () => {
      const tokens = formatLegalText("テスト");
      expect(tokens[0]?.sourceStart).toBe(0);
    });

    it("最後のトークンはsourceEnd=原文長", () => {
      const original = "一万五千";
      const tokens = formatLegalText(original);
      expect(tokens[tokens.length - 1]?.sourceEnd).toBe(original.length);
    });
  });

  describe("sourceToDisplay", () => {
    it("原文位置から表示文字列へ変換できる", () => {
      const original = "一万五千平方メートル";
      const tokens = formatLegalText(original);

      // 原文位置0〜4（一万五千）の表示文字列
      const display = sourceToDisplay(tokens, 0, 4);
      expect(display).toBe("1万5,000");
    });

    it("原文位置から単位の表示文字列を取得できる", () => {
      const original = "五百平方メートル";
      const tokens = formatLegalText(original);

      // 原文位置2〜7（平方メートル）
      const display = sourceToDisplay(tokens, 2, 7);
      expect(display).toBe("m²");
    });

    it("完全にトークン境界に一致しない場合も周辺トークンから復元する", () => {
      const original = "十平方メートル";
      const tokens = formatLegalText(original);

      // 原文位置0〜1（十）
      const display = sourceToDisplay(tokens, 0, 1);
      expect(display).toBe("10");
    });
  });

  describe("displayToSource", () => {
    it("表示位置から原文位置へ変換できる", () => {
      const original = "一万五千平方メートル";
      const tokens = formatLegalText(original);

      // 表示文字列 "1万5,000m²" の位置0〜6（"1万5,000"）→原文位置0〜4
      const source = displayToSource(tokens, 0, 6);
      expect(source).toEqual({ start: 0, end: 4 });
    });

    it("表示位置から単位部分の原文位置を取得できる", () => {
      const original = "五百平方メートル";
      const tokens = formatLegalText(original);
      // 表示: "500m²" → 位置3〜5("m²")→原文位置2〜8（平方メートルは6文字）
      const source = displayToSource(tokens, 3, 5);
      expect(source).toEqual({ start: 2, end: 8 });
    });
  });

  describe("エラー処理（設計書§9）", () => {
    it("処理できない文字列は原文トークンとして返す", () => {
      // 異常な入力でも例外を投げず、フォールバックする
      const tokens = formatLegalText("通常のテキスト");
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]?.kind).toBe("plain");
    });
  });
});
