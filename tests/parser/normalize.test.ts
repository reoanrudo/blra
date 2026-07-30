/**
 * normalize.ts のユニットテスト。
 *
 * 設計書 §9.3 の正規化規則が正しく適用されることを検証する。
 */
import { describe, it, expect } from "vitest";
import { normalizeBody, fingerprint } from "../../src/parser/normalize.js";

describe("normalizeBody", () => {
  it("NFKC正規化で全角英数が半角へ変換される", () => {
    expect(normalizeBody("ＡＢＣ１２３")).toBe("ABC123");
  });

  it("NFKC正規化で半角カナが全角へ統一される", () => {
    // 半角カナ「ｶﾀｶﾅ」→ 全角「カタカナ」
    expect(normalizeBody("ｶﾀｶﾅ")).toBe("カタカナ");
  });

  it("連続する空白類が1つの半角スペースへ正規化される", () => {
    expect(normalizeBody("  a   b\t\tc\n\n")).toBe("a b c");
  });

  it("全角スペースが半角スペースへ正規化される", () => {
    expect(normalizeBody("建築物　及び")).toBe("建築物 及び");
  });

  it("前後の空白が除去される", () => {
    expect(normalizeBody("  本文  ")).toBe("本文");
  });

  it("空文字の入力には空文字を返す", () => {
    expect(normalizeBody("")).toBe("");
  });

  it("空白のみの入力には空文字を返す", () => {
    expect(normalizeBody("   \n\t  ")).toBe("");
  });

  it("ルビ相当のテキストも通常テキストとして扱う（ルビ除外はsegment側）", () => {
    // normalizeBody 自体はルビを除外しない。segment側の NON_BODY_TAGS で除外する。
    expect(normalizeBody("建築物")).toBe("建築物");
  });

  it("漢数字は変換しない（§9.3除外規則: 条項番号の同定を壊さないため）", () => {
    expect(normalizeBody("第五十二条")).toBe("第五十二条");
  });
});

describe("fingerprint", () => {
  it("同じ入力には同じ fingerprint を返す（冪等性）", () => {
    const text = "建築物の敷地は道路に接しなければならない";
    expect(fingerprint(text)).toBe(fingerprint(text));
  });

  it("異なる入力には異なる fingerprint を返す", () => {
    const a = fingerprint("テキストA");
    const b = fingerprint("テキストB");
    expect(a).not.toBe(b);
  });

  it("16文字の hex 文字列を返す", () => {
    const fp = fingerprint("テスト");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("空文字にも fingerprint を生成する（空文字は空でないハッシュになる）", () => {
    const fp = fingerprint("");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
