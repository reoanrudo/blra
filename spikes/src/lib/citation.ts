/**
 * Citation Resolver（設計書 §6.3）
 *
 * 検索クエリ解釈・条文中の参照抽出・AI 引用検証の3者が共用する単一部品。
 * ここでは解決可能性の検証のみを行う。
 */

export type ResolutionMethod = "EXPLICIT" | "RELATIVE" | "ABBREVIATED";

export type CitationRef = {
  /** 未特定なら null（文脈依存の略称・相対参照） */
  lawIdentity: string | null;
  /** art52-2/para1/item3 形式。相対参照では null */
  provisionPath: string | null;
  /**
   * 代替候補。
   * 法令では条に項が1つしかない場合に項番号を省略して
   * 「第二条第九号」と書くが、構造上は第1項の第九号である。
   * primary で解決できない場合にこちらを試す。
   */
  alternatePaths: string[];
  rawText: string;
  span: [number, number];
  resolutionMethod: ResolutionMethod;
  confidence: number;
};

export type ResolveContext = {
  /** 現在読んでいる法令 */
  lawId?: string;
  /** 現在の条項の canonical_path。相対参照の解決に使う */
  provisionPath?: string;
};

const DIGITS: Record<string, number> = {
  〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 「五十二」→ 52、「百十二」→ 112、「二百一」→ 201 */
export function kanjiToNumber(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  let current = 0;
  let seen = false;
  for (const ch of s) {
    if (ch in DIGITS) {
      current = DIGITS[ch]!;
      seen = true;
    } else if (ch in UNITS) {
      total += (seen && current !== 0 ? current : 1) * UNITS[ch]!;
      current = 0;
      seen = false;
    }
  }
  return total + current;
}

/** 法令中で使われる略称。context の法令に依存して解決する */
const ABBREV: Record<string, "SELF_LAW" | "ACT" | "ORDER" | "RULE"> = {
  法: "ACT",
  令: "ORDER",
  規則: "RULE",
  この法律: "SELF_LAW",
  この政令: "SELF_LAW",
  この省令: "SELF_LAW",
};

const NUM = "[〇一二三四五六七八九十百千]+|\\d+";

/**
 * 明示的な条項号参照。
 * 例: 第六条第一項第一号 / 第八十六条の九第一項 / 第52条の2
 */
const EXPLICIT_RE = new RegExp(
  `第(${NUM})条(?:の(${NUM}))?` +
    `(?:第(${NUM})項)?` +
    `(?:第(${NUM})号)?`,
  "g",
);

/** 相対参照。context なしには解決できない */
const RELATIVE_RE =
  /(前条|次条|同条|本条|前項|次項|同項|前号|次号|同号|前二項|前三項|前各項|前各号)/g;

/** 告示番号。例: 平成十二年建設省告示第千四百号 / 平成12年建設省告示第1400号 */
const NOTIFICATION_RE = new RegExp(
  `(明治|大正|昭和|平成|令和)(${NUM})年` +
    `(建設省|国土交通省|運輸省)告示第(${NUM})号`,
  "g",
);

/** 法令名。直前に現れたものを参照先の法令とみなす */
const LAW_NAME_RE = /([^\s、。（）「」]{2,30}?(?:法|法律|政令|省令|規則|条例))(?:（[^）]*）)?/g;

function pathOf(
  art: string,
  sub: string | undefined,
  para: string | undefined,
  item: string | undefined,
): { primary: string; alternates: string[] } {
  let base = `art${kanjiToNumber(art)}`;
  if (sub) base += `-${kanjiToNumber(sub)}`;

  // 項を明示しない号参照は第1項を指す（法令実務の慣行）。
  // 実コーパスでは art2/item9 は存在せず art2/para1/item9 が正しい。
  if (item && !para) {
    const n = kanjiToNumber(item);
    return {
      primary: `${base}/para1/item${n}`,
      alternates: [`${base}/item${n}`],
    };
  }

  let p = base;
  if (para) p += `/para${kanjiToNumber(para)}`;
  if (item) p += `/item${kanjiToNumber(item)}`;
  // 条のみの参照は第1項も候補にする
  const alternates = !para && !item ? [`${base}/para1`] : [];
  return { primary: p, alternates };
}

export function resolve(text: string, ctx: ResolveContext = {}): CitationRef[] {
  const refs: CitationRef[] = [];

  // 直前に出現した法令名を追跡する
  const lawNames: { name: string; end: number }[] = [];
  for (const m of text.matchAll(LAW_NAME_RE)) {
    lawNames.push({ name: m[1]!, end: m.index! + m[0]!.length });
  }
  const lawBefore = (pos: number): string | null => {
    let best: string | null = null;
    for (const l of lawNames) {
      // 直前 40 文字以内に法令名があればそれを採る
      if (l.end <= pos && pos - l.end <= 40) best = l.name;
    }
    return best;
  };

  for (const m of text.matchAll(EXPLICIT_RE)) {
    const [raw, art, sub, para, item] = m;
    const start = m.index!;
    const named = lawBefore(start);
    const abbrevHit = Object.keys(ABBREV).find((a) =>
      text.slice(Math.max(0, start - a.length), start).endsWith(a),
    );

    const paths = pathOf(art!, sub, para, item);
    refs.push({
      lawIdentity: named ?? (abbrevHit ? `@${abbrevHit}` : ctx.lawId ?? null),
      provisionPath: paths.primary,
      alternatePaths: paths.alternates,
      rawText: raw,
      span: [start, start + raw.length],
      resolutionMethod: named
        ? "EXPLICIT"
        : abbrevHit
          ? "ABBREVIATED"
          : "EXPLICIT",
      confidence: named ? 0.95 : abbrevHit ? 0.8 : 0.7,
    });
  }

  for (const m of text.matchAll(RELATIVE_RE)) {
    const raw = m[1]!;
    const start = m.index!;
    refs.push({
      lawIdentity: ctx.lawId ?? null,
      provisionPath: resolveRelative(raw, ctx.provisionPath),
      alternatePaths: [],
      rawText: raw,
      span: [start, start + raw.length],
      resolutionMethod: "RELATIVE",
      confidence: ctx.provisionPath ? 0.75 : 0.3,
    });
  }

  for (const m of text.matchAll(NOTIFICATION_RE)) {
    const [raw, era, year, ministry, num] = m;
    const start = m.index!;
    refs.push({
      lawIdentity: `${era}${kanjiToNumber(year!)}年${ministry}告示第${kanjiToNumber(num!)}号`,
      provisionPath: null,
      alternatePaths: [],
      rawText: raw,
      span: [start, start + raw.length],
      resolutionMethod: "EXPLICIT",
      confidence: 0.9,
    });
  }

  return refs.sort((a, b) => a.span[0] - b.span[0]);
}

/**
 * 相対参照を context の位置から解決する。
 * context がなければ null（設計書 §6.3: 解決済みとして扱わない）
 */
function resolveRelative(
  token: string,
  currentPath: string | undefined,
): string | null {
  if (!currentPath) return null;
  const artMatch = currentPath.match(/^art(\d+)(?:-(\d+))?/);
  if (!artMatch) return null;
  const art = Number(artMatch[1]);

  switch (token) {
    case "前条":
      return `art${art - 1}`;
    case "次条":
      return `art${art + 1}`;
    case "同条":
    case "本条":
      return `art${art}`;
    case "前項": {
      const p = currentPath.match(/para(\d+)/);
      return p ? `art${art}/para${Number(p[1]) - 1}` : null;
    }
    case "次項": {
      const p = currentPath.match(/para(\d+)/);
      return p ? `art${art}/para${Number(p[1]) + 1}` : null;
    }
    case "同項":
      return currentPath;
    default:
      return null; // 前二項・前各号などは範囲参照。単一 path へ解決しない
  }
}

/** 設計書 §9.3 の正規化。検索側とインデックス側で同一の処理を使う */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 検索クエリを引用指定として解釈する（設計書 §9.1 の引用指定ルート）。
 * 例: 「法35条」「令112条9項」「建築基準法第35条」
 */
export function parseQuery(q: string): CitationRef | null {
  const n = normalize(q);
  const m = n.match(
    new RegExp(
      `^\\s*(建築基準法施行規則|建築基準法施行令|建築基準法|法|令|規則)?\\s*` +
        `第?(${NUM})条(?:の(${NUM}))?` +
        `\\s*(?:第?(${NUM})項)?` +
        `\\s*(?:第?(${NUM})号)?\\s*$`,
    ),
  );
  if (!m) return null;
  const [raw, law, art, sub, para, item] = m;
  const paths = pathOf(art!, sub, para, item);
  return {
    lawIdentity: law ?? null,
    provisionPath: paths.primary,
    alternatePaths: paths.alternates,
    rawText: raw,
    span: [0, q.length],
    resolutionMethod: law && law.length <= 2 ? "ABBREVIATED" : "EXPLICIT",
    confidence: law ? 0.95 : 0.6,
  };
}
