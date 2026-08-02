/**
 * 取込対象法令メタデータ。
 *
 * 収録範囲の正本は law-book-2026.ts。ここでは取込処理向けに、
 * e-Gov法令ID・正式名称・表示略称・Prisma互換の種別へ変換する。
 */

import {
  LAW_BOOK_2026,
  lawCategoryFromEgovId,
  type LawCategory,
} from "./law-book-2026";

export interface LawConfig {
  egovLawId: string;
  name: string;
  shortName: string;
  category: LawCategory;
  displayOrder: number;
  inclusionMode: "full" | "excerpt";
  printedPage: number;
}

const INDUSTRY_SHORT_NAMES: Readonly<Record<string, string>> = {
  "325AC0000000201": "建基法",
  "325CO0000000338": "建基令",
  "325M50004000040": "建基規",
  "325AC1000000202": "建築士法",
  "325CO0000000201": "建築士令",
  "325M50004000038": "建築士規",
  "343AC0000000100": "都計法",
  "344CO0000000158": "都計令",
  "344M50004000049": "都計規",
  "323AC1000000186": "消防法",
  "336CO0000000037": "消防令",
  "418AC0000000091": "バリアフリー法",
  "418CO0000000379": "バリアフリー令",
  "418M60000800110": "バリアフリー規",
  "427AC0000000053": "建築物省エネ法",
  "428CO0000000008": "建築物省エネ令",
  "428M60000800005": "建築物省エネ規",
  "354AC0000000049": "省エネ法",
  "354CO0000000267": "省エネ令",
  "407AC0000000123": "耐震改修促進法",
  "407CO0000000429": "耐震改修促進令",
  "407M50004000028": "耐震改修促進規",
};

export const LAWS: readonly LawConfig[] = LAW_BOOK_2026.map((entry) => ({
  egovLawId: entry.egovLawId,
  name: entry.officialTitle,
  shortName: INDUSTRY_SHORT_NAMES[entry.egovLawId] ?? entry.officialTitle,
  category: lawCategoryFromEgovId(entry.egovLawId),
  displayOrder: entry.displayOrder,
  inclusionMode: entry.inclusionMode,
  printedPage: entry.printedPage,
}));
