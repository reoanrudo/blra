/**
 * 法令本文表示用の固定単位辞書（設計書§4.4）。
 *
 * OCRで確認した建築法令集2026年版の単位表記に基づく。
 * 複合単位を単独単位より先に照合するため、
 * from文字列の長い順（降順）にソート済みのリストを保持する。
 *
 * この辞書にない組合せは原文のまま表示し、実行時に推測しない（設計書§4.4）。
 */

export interface UnitEntry {
  /** 原文中の単位表現 */
  from: string;
  /** 表示用の記号化単位 */
  to: string;
  /**
   * 複合単位（漢数字で始まる、例: 「一立方メートルにつきキログラム」）は
   * 文章中の任意位置で安全に照合できる。
   * 単独単位（例: 「グラム」「メートル」）は、直前に数量がある場合のみ変換する。
   * これにより「プログラム→プロg」「パラメートル→パラm」等の誤変換を防ぐ。
   */
  isCompound: boolean;
}

/**
 * 単独単位と複合単位のマスターリスト。
 * ソートは module scope で一度だけ行う（設計書§10 性能要件）。
 *
 * 法令集2026年版OCRで確認した表記に基づく。
 */
const RAW_UNIT_ENTRIES: UnitEntry[] = [
  // --- 複合単位（漢数字で始まる。長い順に並べることで部分置換誤変換を防止） ---
  { from: "一キログラムケルビンにつきキロジュール", to: "kJ/kgK", isCompound: true },
  { from: "一立方メートルにつきキログラム", to: "kg/m³", isCompound: true },
  { from: "一秒間につき立方メートル", to: "m³/秒", isCompound: true },
  { from: "一時間につき立方メートル", to: "m³/時間", isCompound: true },
  { from: "一平方メートルにつきニュートン", to: "N/m²", isCompound: true },
  { from: "一平方メートルにつきキログラム", to: "kg/m²", isCompound: true },
  { from: "一立方メートルにつきニュートン", to: "N/m³", isCompound: true },
  { from: "一時間につきキロジュール", to: "kJ/時間", isCompound: true },
  { from: "一キログラムにつきジュール", to: "J/kg", isCompound: true },
  { from: "一モルにつきジュール", to: "J/mol", isCompound: true },

  // --- 単独単位（直前に数量がある場合のみ変換。長い順） ---
  // 面積
  { from: "平方キロメートル", to: "km²", isCompound: false },
  { from: "平方メートル", to: "m²", isCompound: false },
  { from: "平方センチメートル", to: "cm²", isCompound: false },
  { from: "平方ミリメートル", to: "mm²", isCompound: false },
  { from: "ヘクタール", to: "ha", isCompound: false },

  // 体積
  { from: "立方メートル", to: "m³", isCompound: false },
  { from: "立方センチメートル", to: "cm³", isCompound: false },

  // 長さ
  { from: "キロメートル", to: "km", isCompound: false },
  { from: "センチメートル", to: "cm", isCompound: false },
  { from: "ミリメートル", to: "mm", isCompound: false },
  { from: "メートル", to: "m", isCompound: false },

  // 質量
  { from: "キログラム", to: "kg", isCompound: false },
  { from: "ミリグラム", to: "mg", isCompound: false },
  { from: "グラム", to: "g", isCompound: false },

  // エネルギー・電力
  { from: "ギガジュール", to: "GJ", isCompound: false },
  { from: "メガジュール", to: "MJ", isCompound: false },
  { from: "キロジュール", to: "kJ", isCompound: false },
  { from: "メガワット", to: "MW", isCompound: false },
  { from: "キロワット", to: "kW", isCompound: false },
  { from: "ジュール", to: "J", isCompound: false },

  // 物理量
  { from: "ケルビン", to: "K", isCompound: false },
  { from: "ニュートン", to: "N", isCompound: false },
  { from: "パスカル", to: "Pa", isCompound: false },
  { from: "モル", to: "mol", isCompound: false },

  // 割合
  { from: "パーセント", to: "%", isCompound: false },
];

/**
 * 長い順（降順）にソート済みの単位エントリ。
 * 複合単位が単独単位より常に先に照合されることを保証する。
 */
export const UNIT_ENTRIES: readonly UnitEntry[] = Object.freeze(
  [...RAW_UNIT_ENTRIES].sort((a, b) => b.from.length - a.from.length),
);

/**
 * 指定位置の直前が数量表現であるか判定する。
 *
 * 単独単位を安全に変換するためのガード（設計書§4.4）。
 * 数量とは: 算用数字、漢数字、小数点・カンマ区切りの数値。
 * 複数行にまたがる場合は前行末を参照しない（position > 0 のみ）。
 *
 * 例:
 * - 「3メートル」→ 直前が '3' → 数量あり → 変換OK
 * - 「プログラム」→ 直前が 'ラ' → 数量なし → 変換しない
 * - 「パラメートル」→ 直前が 'ラ' → 数量なし → 変換しない
 */
function hasPrecedingQuantity(text: string, position: number): boolean {
  if (position <= 0) return false;
  const prevChar = text[position - 1]!;
  // 算用数字、漢数字、カンマ、小数点
  return /[0-9,.．，]/.test(prevChar) || /[零〇一二三四五六七八九十百千万億]/.test(prevChar);
}

/**
 * 指定位置から始まる単位を検索する。
 * 複合単位を先に確認し、部分置換による誤変換を防止する。
 *
 * 単独単位は直前に数量がある場合のみマッチする（設計書§4.4）。
 * 複合単位は漢数字で始まるため、数量制約を暗黙に満たす。
 *
 * @param text 検索対象の全文
 * @param position 検索開始位置（この位置から単位が始まる場合のみマッチ）
 * @returns マッチした場合は単位情報と範囲、しない場合は null
 */
export function findUnitMatch(
  text: string,
  position: number,
): { from: string; to: string; start: number; end: number } | null {
  for (const entry of UNIT_ENTRIES) {
    const candidate = text.substr(position, entry.from.length);
    if (candidate !== entry.from) continue;

    // 単独単位は直前に数量がある場合のみマッチする
    if (!entry.isCompound && !hasPrecedingQuantity(text, position)) {
      continue;
    }

    return {
      from: entry.from,
      to: entry.to,
      start: position,
      end: position + entry.from.length,
    };
  }
  return null;
}
