import { describe, it, expect } from "vitest";
import { formatLegalText, sourceToDisplay, displayToSource } from "@/lib/article/legal-display-format";

/**
 * 表示変換と原文座標の統合テスト（設計書§11 Integration）。
 *
 * DB不要・純粋関数の範囲のみ検証する（設計書§10）。
 * リンクレンダリング（.tsx）は E2E テストで検証する。
 */

describe("表示変換と原文座標の統合（設計書§11 Integration）", () => {
  describe("リンク範囲相当の原文復元", () => {
    it("sourceToDisplay でリンク範囲の表示文字列を取得できる", () => {
      const text = "面積は一万平方メートル以上";
      const tokens = formatLegalText(text);

      // 原文位置3〜11（一万平方メートル: 一万=3-5, 平方メートル=5-11）
      const display = sourceToDisplay(tokens, 3, 11);
      expect(display).toContain("1万");
      expect(display).toContain("m²");
    });

    it("複合単位を含む範囲の表示文字列を取得できる", () => {
      const text = "単位は一立方メートルにつきキログラムである";
      const tokens = formatLegalText(text);

      // 原文位置3〜18（一立方メートルにつきキログラム）
      const display = sourceToDisplay(tokens, 3, 18);
      expect(display).toBe("kg/m³");
    });
  });

  describe("双方向マッピングの往復", () => {
    it("source → display → source の往復が正しい", () => {
      const text = "一万五千平方メートル";
      const tokens = formatLegalText(text);
      // トークン: [0-4]"1万5,000"(表示長7) [4-10]"m²"(表示長2)
      const fullDisplay = tokens.map((t) => t.displayText).join("");
      // fullDisplay = "1万5,000m²" (len=9)

      // 数値トークン部分（表示位置0〜7 = "1万5,000"）→原文範囲0〜4
      const restored = displayToSource(tokens, 0, 7);
      expect(restored).toEqual({ start: 0, end: 4 });
      expect(fullDisplay.substring(0, 7)).toBe("1万5,000");
    });
  });

  describe("除外表現の維持", () => {
    it("第一種は原文のまま表示される", () => {
      const text = "第一種住居専用地域の面積は五百平方メートル";
      const tokens = formatLegalText(text);
      const display = tokens.map((t) => t.displayText).join("");

      // 第一種は維持、五百平方メートルは変換
      expect(display).toContain("第一種");
      expect(display).toContain("500m²");
    });

    it("条文参照は算用数字化される", () => {
      const text = "第二条の規定により面積は千平方メートル";
      const tokens = formatLegalText(text);
      const display = tokens.map((t) => t.displayText).join("");

      expect(display).toContain("第2条");
      expect(display).toContain("1,000m²");
    });
  });

  describe("トークン境界の整合性", () => {
    it("全トークンが隙間なく隣接している", () => {
      const text = "第2項の規定により一立方メートルにつきキログラム以上";
      const tokens = formatLegalText(text);

      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i]!.sourceStart).toBe(tokens[i - 1]!.sourceEnd);
      }
    });

    it("最初と最後のトークンがテキスト全体を覆う", () => {
      const text = "一万五千平方メートル十分の七";
      const tokens = formatLegalText(text);

      expect(tokens[0]!.sourceStart).toBe(0);
      expect(tokens[tokens.length - 1]!.sourceEnd).toBe(text.length);
    });
  });
});
