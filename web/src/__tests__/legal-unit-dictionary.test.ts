import { describe, it, expect } from "vitest";
import {
  findUnitMatch,
  UNIT_ENTRIES,
} from "@/lib/article/legal-unit-dictionary";

describe("legal-unit-dictionary（設計書§4.4）", () => {
  describe("UNIT_ENTRIES の順序", () => {
    it("複合単位が単独単位より前に並んでいる", () => {
      // 部分置換誤変換を防ぐため、長い複合単位を先に照合する（設計書§4.4）
      let prevLen = Infinity;
      for (const entry of UNIT_ENTRIES) {
        expect(entry.from.length).toBeLessThanOrEqual(prevLen);
        prevLen = entry.from.length;
      }
    });
  });

  describe("findUnitMatch", () => {
    it("単独単位「ミリメートル」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("厚さは3ミリメートル単位", 4);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("ミリメートル");
      expect(result?.to).toBe("mm");
      expect(result?.start).toBe(4);
      expect(result?.end).toBe(10);
    });

    it("単独単位「平方メートル」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("一万平方メートル", 2);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("平方メートル");
      expect(result?.to).toBe("m²");
    });

    it("単独単位「立方メートル」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("一立方メートル", 1);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("立方メートル");
      expect(result?.to).toBe("m³");
    });

    it("単独単位「キログラム」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("質量は5キログラム", 4);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("キログラム");
      expect(result?.to).toBe("kg");
    });

    it("単独単位「キロワット」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("出力3キロワット", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("キロワット");
      expect(result?.to).toBe("kW");
    });

    it("単独単位「キロジュール」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("エネルギー7キロジュール", 6);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("キロジュール");
      expect(result?.to).toBe("kJ");
    });

    it("複合単位「一立方メートルにつきキログラム」を単独より先にマッチする", () => {
      const text = "一立方メートルにつきキログラム";
      const result = findUnitMatch(text, 0);
      expect(result).not.toBeNull();
      // 複合単位全体がマッチすること（部分置換ではない）
      expect(result?.from).toBe("一立方メートルにつきキログラム");
      expect(result?.to).toBe("kg/m³");
      expect(result?.start).toBe(0);
      expect(result?.end).toBe(text.length);
    });

    it("複合単位「一秒間につき立方メートル」にマッチする", () => {
      const result = findUnitMatch("一秒間につき立方メートル", 0);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("一秒間につき立方メートル");
      expect(result?.to).toBe("m³/秒");
    });

    it("複合単位「一時間につき立方メートル」にマッチする", () => {
      const result = findUnitMatch("一時間につき立方メートル", 0);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("一時間につき立方メートル");
      expect(result?.to).toBe("m³/時間");
    });

    it.each([
      ["立方メートル毎時", "m³/時間"],
      ["立方メートル毎分", "m³/分"],
      ["リットル毎分", "L/分"],
      ["メートル毎秒毎秒", "m/秒²"],
      ["メートル毎秒", "m/秒"],
      ["ミリグレイ毎時", "mGy/時間"],
      ["マイクログレイ毎時", "μGy/時間"],
      ["マイクロシーベルト毎時", "μSv/時間"],
    ])("時間単位 %s を %s に変換する", (source, expected) => {
      expect(findUnitMatch(source, 0)).toMatchObject({
        from: source,
        to: expected,
        start: 0,
        end: source.length,
      });
    });

    it("辞書にない毎日単位は推測変換しない", () => {
      expect(findUnitMatch("立方メートル毎日", 0)).toBeNull();
    });

    it("複合単位「一キログラムケルビンにつきキロジュール」にマッチする", () => {
      const result = findUnitMatch("一キログラムケルビンにつきキロジュール", 0);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("一キログラムケルビンにつきキロジュール");
      expect(result?.to).toBe("kJ/kgK");
    });

    it("辞書にない単位表現にはマッチしない", () => {
      expect(findUnitMatch("トン", 0)).toBeNull();
      expect(findUnitMatch("リットル", 0)).toBeNull();
    });

    it("通常単語に含まれる単独単位は変換しない（直前に数量がない）", () => {
      // 「プログラム」の「グラム」は変換しない
      expect(findUnitMatch("プログラム", 3)).toBeNull();
      // 「パラメートル」の「メートル」は変換しない
      expect(findUnitMatch("パラメートル", 2)).toBeNull();
      // 「アルゴリズム」の途中から始まる単位はないが、念のため
      expect(findUnitMatch("コンピュータプログラム", 7)).toBeNull();
    });

    it("単位が含まれないテキストにはマッチしない", () => {
      expect(findUnitMatch("建築物の敷地", 0)).toBeNull();
      expect(findUnitMatch("認定する", 0)).toBeNull();
    });

    it("指定位置に単位がない場合はマッチしない", () => {
      expect(findUnitMatch("3ミリメートル", 1)).not.toBeNull(); // 位置1に存在
      // 位置0（3）からは単位が始まらない
      expect(findUnitMatch("3ミリメートル", 0)).toBeNull();
      // 位置2（リ）からは単位が始まらない
      expect(findUnitMatch("3ミリメートル", 2)).toBeNull();
    });

    it("「センチメートル」は「cm」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("厚さ5センチメートル", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("センチメートル");
      expect(result?.to).toBe("cm");
    });

    it("「キロメートル」は「km」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("距離10キロメートル", 4);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("キロメートル");
      expect(result?.to).toBe("km");
    });

    it("「メガワット」は「MW」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("出力2メガワット", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("メガワット");
      expect(result?.to).toBe("MW");
    });

    it("「メガジュール」は「MJ」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("エネルギー9メガジュール", 6);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("メガジュール");
      expect(result?.to).toBe("MJ");
    });

    it("「メートル」は「m」にマッチする（直前に数量あり）", () => {
      const result = findUnitMatch("高さ6メートル", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("メートル");
      expect(result?.to).toBe("m");
    });

    it("「ヘクタール」は「ha」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("面積5ヘクタール", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("ヘクタール");
      expect(result?.to).toBe("ha");
    });

    it("「パーセント」は「%」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("割合50パーセント", 4);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("パーセント");
      expect(result?.to).toBe("%");
    });

    it("「ケルビン」は「K」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("温度300ケルビン", 5);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("ケルビン");
      expect(result?.to).toBe("K");
    });

    it("「ミリグラム」は「mg」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("質量5ミリグラム", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("ミリグラム");
      expect(result?.to).toBe("mg");
    });

    it("「グラム」は「g」にマッチする（法令集2026年版OCR確認済み・直前に数量あり）", () => {
      const result = findUnitMatch("質量100グラム", 5);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("グラム");
      expect(result?.to).toBe("g");
    });

    it("「平方センチメートル」は「cm²」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("面積5平方センチメートル", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("平方センチメートル");
      expect(result?.to).toBe("cm²");
    });

    it("「平方ミリメートル」は「mm²」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("面積3平方ミリメートル", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("平方ミリメートル");
      expect(result?.to).toBe("mm²");
    });

    it("「立方センチメートル」は「cm³」にマッチする（法令集2026年版OCR確認済み）", () => {
      const result = findUnitMatch("体積2立方センチメートル", 3);
      expect(result).not.toBeNull();
      expect(result?.from).toBe("立方センチメートル");
      expect(result?.to).toBe("cm³");
    });
  });
});
