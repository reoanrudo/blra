/**
 * 法令標準XML LawNode 木 → ProvisionSegment[] への分解。
 *
 * 設計書 §6.1（Citation Anchor / canonical_path）、§8.3（Validation）、
 * §9.3（正規化規則）に対応。
 *
 * spike (spikes/src/lib/segment.ts) で抽出率 99.97〜100% を達成した
 * F-2 パーサーのロジックを本実装へ昇華したもの。
 *
 * spike からの主な変更点:
 *  - ProvisionSegment 型へ正規化本文・fingerprint・citation_anchor を追加
 *  - body_normalized と content_fingerprint を segment 時に生成
 *  - text_quote_selector (prefix/suffix) を生成
 *  - 別表の canonical_path をタイトルから生成（spike では連番だった問題を修正）
 *  - Validation を独立関数として分離
 */

import type { LawNode } from "./xml-to-tree.js";
import {
  childrenOf,
  firstChild,
  textOf,
} from "./xml-to-tree.js";
import type {
  ProvisionSegment,
  ProvisionType,
  ValidationError,
} from "./types.js";
import { normalizeBody, fingerprint } from "./normalize.js";

// === 定数 ===

const KANJI_NUM = "〇一二三四五六七八九";

/**
 * 分母（本文文字数の計測）から除くタグ。
 * 見出し・番号・目次はナビゲーション情報であり Provision の本文ではない。
 * 条項番号は stable_label へ、見出しは heading へ入るため二重計上しない。
 *
 * spike/src/lib/segment.ts の NON_BODY_TAGS と同じ。
 */
const NON_BODY_TAGS = new Set([
  "TOC",
  "LawTitle",
  "PartTitle",
  "ChapterTitle",
  "SectionTitle",
  "SubsectionTitle",
  "DivisionTitle",
  "ArticleTitle",
  "ArticleRange",
  "ParagraphNum",
  "ItemTitle",
  "Subitem1Title",
  "Subitem2Title",
  "Subitem3Title",
  "SupplProvisionLabel",
  // ルビの読み仮名。本文へ混入すると表示も検索索引も壊れる
  // （「建築物けんちくぶつ」のような連結が起きる）
  "Rt",
  "Rp",
]);

// === ヘルパー関数 ===

/**
 * 算用数字を漢数字へ変換する（条番号・項番号用）。
 * 例: 1 → 一、12 → 十二、52 → 五十二、100 → 百
 *
 * 法令の条番号は漢数字で表記する（設計書 §6.1 例: 第52条の2第1項第3号）。
 * Num 属性は算用数字だが、stable_label では漢数字へ戻す。
 * 項番号は例外で、漢数字ではなく算用数字のまま（法令の慣行: 第1項、第2項）。
 */
function toKanjiNum(n: number): string {
  if (n === 0) return "〇";
  if (n < 0) return `-${toKanji(-n)}`;
  return toKanji(n);
}

function toKanji(n: number): string {
  const kanjiDigits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  if (n === 0) return "";
  if (n < 10) return kanjiDigits[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return (tens > 1 ? kanjiDigits[tens] : "") + "十" + (ones > 0 ? kanjiDigits[ones] : "");
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return (hundreds > 1 ? kanjiDigits[hundreds] : "") + "百" + (rest > 0 ? toKanji(rest) : "");
  }
  if (n < 10000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return (thousands > 1 ? kanjiDigits[thousands] : "") + "千" + (rest > 0 ? toKanji(rest) : "");
  }
  // 万以上は対応外（法令の条番号で万以上は存在しない）
  return String(n);
}

/**
 * 条番号ラベルを生成する。
 * 例: "1" → "第一条"、"52_2" → "第五十二条の二"
 *
 * Num 属性は算用数字（ "_" 区切りで条の分割を表す）。
 * stable_label では漢数字へ変換し、"_" → "の" とする。
 * 法令の慣行: 「第N条のM」（条の後に「の」が来る）。
 */
function numToArticleLabel(num: string): string {
  const parts = num.split("_");
  const mainNum = toKanjiNum(parseInt(parts[0]!, 10));
  const subParts = parts.slice(1).map((p) => toKanjiNum(parseInt(p, 10)));
  if (subParts.length === 0) {
    return `第${mainNum}条`;
  }
  return `第${mainNum}条の${subParts.join("の")}`;
}

/**
 * 項番号ラベルを生成する。
 * 例: "1" → "第1項"
 *
 * 項番号は法令の慣行で算用数字のまま（第1項、第2項）。
 */
function numToParagraphLabel(num: string): string {
  return `第${num}項`;
}

/**
 * 号ラベルを生成する。
 * ItemTitle のテキストがあればそれを使い、なければ Num から生成。
 * 例: title="一" → "第一号"、num="1" → "第一号"
 */
function itemLabel(title: string, num: string): string {
  // ItemTitle は漢数字（一、二、三...）なのでそのまま使う
  // Num 属性からのフォールバックの場合は漢数字へ変換
  if (title) return `第${title}号`;
  return `第${toKanjiNum(parseInt(num, 10))}号`;
}

/** Num 属性を安全に取り出す */
function attrNum(node: LawNode): string {
  return node.attr?.Num ?? "";
}

/**
 * 直下の子のうち、除外タグと指定タグを除いた全テキストを連結する。
 * ParagraphSentence だけを見ると条文内の表（TableStruct）を落とすため、
 * 「残り全部を取る」方式にする（F-2 で実測）。
 */
function bodyOf(node: LawNode, excludeTags: string[]): string {
  const parts: string[] = [];
  for (const c of node.children ?? []) {
    if (typeof c === "string") {
      parts.push(c);
      continue;
    }
    if (excludeTags.includes(c.tag)) continue;
    if (NON_BODY_TAGS.has(c.tag)) continue;
    parts.push(bodyText(c));
  }
  return parts.join("").trim();
}

/** textOf と違い、NON_BODY_TAGS を再帰的に除外する。 */
function bodyText(node: LawNode | string): string {
  if (typeof node === "string") return node;
  if (NON_BODY_TAGS.has(node.tag)) return "";
  return (node.children ?? []).map(bodyText).join("");
}

// === 別表の canonical_path 生成 ===
// 設計書 §6.1: 出現順の連番ではなく、タイトルから生成する。

/**
 * 別表タイトルから canonical_path 用の slug を生成する。
 * 例: "別表第一" → "table-1"
 *      "様式第一の二" → "style-1-2"
 *
 * 漢数字を算用数字へ変換し、法令用語のプレフィックスを取る。
 * タイトルが取れない、またはパースできない場合は undefined を返す（呼び出し側でフォールバック）。
 */
function appdxSlug(title: string, tag: string): string | undefined {
  // タグから種別を判定
  let prefix: string;
  if (tag.startsWith("AppdxTable")) prefix = "table";
  else if (tag.startsWith("AppdxStyle")) prefix = "style";
  else if (tag.startsWith("AppdxNote")) prefix = "note";
  else if (tag.startsWith("Appdx")) prefix = "appdx";
  else return undefined;

  // タイトルから数字部分を抽出
  // "別表第一" → 漢数字 "一" を取り出す
  // "様式第一の二" → 漢数字 "一の二" を取り出す
  const match = title.match(/第(.+)$/);
  if (!match) return undefined;

  const kanjiPart = match[1];
  const numPart = kanjiToNumber(kanjiPart);
  if (numPart === undefined) return undefined;

  return `${prefix}-${numPart}`;
}

/**
 * 漢数字（一の二、三の五、十二 等）を算用数字文字列（1-2, 3-5, 12 等）へ変換する。
 * 変換できない場合は undefined を返す。
 */
function kanjiToNumber(kanji: string): string | undefined {
  const segments = kanji.split("の");
  const parts: string[] = [];

  for (const seg of segments) {
    if (seg.length === 0) return undefined;
    const n = kanjiSegmentToNumber(seg);
    if (n === undefined) return undefined;
    parts.push(String(n));
  }

  return parts.join("-");
}

/**
 * 単一セグメントの漢数字を数値へ変換する。
 * 例: 一 → 1、十二 → 12、二十 → 20、百 → 100
 */
function kanjiSegmentToNumber(seg: string): number | undefined {
  let total = 0;
  let current = 0;
  let hasDigit = false;

  for (const ch of seg) {
    const digit = KANJI_NUM.indexOf(ch);
    if (digit >= 0) {
      // 一〜九
      current = current * 10 + digit;
      hasDigit = true;
    } else if (ch === "十") {
      total += (current || 1) * 10;
      current = 0;
      hasDigit = true;
    } else if (ch === "百") {
      total += (current || 1) * 100;
      current = 0;
      hasDigit = true;
    } else if (ch === "千") {
      total += (current || 1) * 1000;
      current = 0;
      hasDigit = true;
    } else {
      return undefined;
    }
  }

  total += current;
  return hasDigit ? total : undefined;
}

// === segment 本体 ===

/** 内部コンテキスト: walker が状態を受け渡すためのもの */
interface WalkCtx {
  inSuppl: boolean;
  pathPrefix: string;
  amendLawNum?: string;
  /** citation_anchor 生成用の jurisdiction/sourceIdentity */
  anchorPrefix: string;
}

/** segment() の戻り値 */
interface SegmentInternal {
  segments: ProvisionSegment[];
  /** 取りこぼし計測用に消費されたノード */
  consumed: Set<LawNode>;
  totalChars: number;
}

/**
 * LawBody ノードを ProvisionSegment[] へ分解する。
 *
 * @param lawBody LawBody ノード（e-Gov XML のルート直下）
 * @param jurisdiction citation_anchor の jurisdiction 部分
 * @param sourceIdentity citation_anchor の sourceIdentity 部分
 */
export function segment(
  lawBody: LawNode,
  jurisdiction: string,
  sourceIdentity: string,
): SegmentInternal {
  const segments: ProvisionSegment[] = [];
  const consumed = new Set<LawNode>();
  let seq = 0;
  const anchorPrefix = `${jurisdiction}/${sourceIdentity}`;

  /**
   * ProvisionSegment を生成して配列へ追加する。
   * body から bodyNormalized, fingerprint, citationAnchor, quoteSelector を派生させる。
   */
  function pushSegment(
    canonicalPath: string,
    stableLabel: string,
    provisionType: ProvisionType,
    heading: string,
    body: string,
    ctx: WalkCtx,
    amendLawNum?: string,
  ): void {
    const bodyNormalized = normalizeBody(body);
    const fp = fingerprint(bodyNormalized);
    const citationAnchor = `${ctx.anchorPrefix}/${canonicalPath}`;

    // text_quote_selector: 正規化本文の前後32文字
    const quoteLen = 32;
    const textQuotePrefix = bodyNormalized.slice(0, quoteLen);
    const textQuoteSuffix =
      bodyNormalized.length > quoteLen
        ? bodyNormalized.slice(-quoteLen)
        : "";

    segments.push({
      canonicalPath,
      stableLabel,
      provisionType,
      heading,
      body,
      bodyNormalized,
      contentFingerprint: fp,
      citationAnchor,
      textQuotePrefix,
      textQuoteSuffix,
      sequence: seq++,
      amendLawNum,
    });
  }

  /**
   * 号（Item）およびその子号（Subitem1, Subitem2...）を処理する。
   * @param level 0 = Item、n>=1 = Subitem{n}
   */
  function pushItem(
    node: LawNode,
    parentPath: string,
    parentLabel: string,
    level: number,
    ctx: WalkCtx,
  ): void {
    const num = attrNum(node);
    const titleTag = level === 0 ? "ItemTitle" : `Subitem${level}Title`;
    const childTag = `Subitem${level + 1}`;

    const titleNode = firstChild(node, titleTag);
    const titleText = titleNode ? textOf(titleNode).trim() : "";
    // canonical_path: Num 属性の "_" → "-"
    const path = `${parentPath}/item${num.split("_").join("-")}`;
    // stable_label: ItemTitle の漢数字があればそれを使い、なければ Num から漢数字生成
    const label = `${parentLabel}${itemLabel(titleText, num)}`;
    const body = bodyOf(node, [childTag]);

    pushSegment(path, label, "ITEM", "", body, ctx, ctx.amendLawNum);
    consumed.add(node);

    for (const sub of childrenOf(node, childTag)) {
      consumed.delete(sub);
      pushItem(sub, path, label, level + 1, ctx);
    }
  }

  function pushParagraph(
    node: LawNode,
    parentPath: string,
    parentLabel: string,
    ctx: WalkCtx,
  ): void {
    const num = attrNum(node) || "1";
    // canonical_path: Num 属性の "_" → "-"
    const path = `${parentPath}/para${num.split("_").join("-")}`;
    // stable_label: 項番号は算用数字のまま（法令慣行）
    const label = `${parentLabel}${numToParagraphLabel(num)}`;
    const caption = firstChild(node, "ParagraphCaption");
    const heading = caption ? textOf(caption).trim() : "";
    const body = bodyOf(node, ["Item", "ParagraphCaption"]);

    pushSegment(path, label, "PARAGRAPH", heading, body, ctx, ctx.amendLawNum);
    consumed.add(node);

    for (const item of childrenOf(node, "Item")) {
      consumed.delete(item);
      pushItem(item, path, label, 0, ctx);
    }
  }

  function pushArticle(node: LawNode, ctx: WalkCtx): void {
    const num = attrNum(node);
    // canonical_path: Num 属性の "_" → "-"
    const path = `${ctx.pathPrefix}art${num.split("_").join("-")}`;
    // stable_label: 条番号は漢数字へ変換（設計書 §6.1 例: 第五十二条の二）
    const label = numToArticleLabel(num);
    const caption = firstChild(node, "ArticleCaption");
    const heading = caption ? textOf(caption).trim() : "";

    // 条（ARTICLE / SUPPLEMENTARY）自体の body は空。
    // 子の Paragraph が本文を持つ。
    pushSegment(
      path,
      label,
      ctx.inSuppl ? "SUPPLEMENTARY" : "ARTICLE",
      heading,
      "",
      ctx,
      ctx.amendLawNum,
    );
    consumed.add(node);

    for (const p of childrenOf(node, "Paragraph")) {
      consumed.delete(p);
      pushParagraph(p, path, label, ctx);
    }
  }

  // 別表の重複タイトルを追跡し、フォールバック時に連番を振る
  const appdxSlugSeen = new Map<string, number>();

  function pushAppdx(node: LawNode, ctx: WalkCtx): void {
    const tag = node.tag;
    const titleNode = firstChild(node, `${tag}Title`);
    const title = titleNode ? textOf(titleNode).trim() : tag;

    // タイトルから slug を生成
    let slug = appdxSlug(title, tag);
    let canonicalPath: string;

    if (slug) {
      const fullSlug = `appdx-${slug}`;
      // 重複チェック
      const seen = appdxSlugSeen.get(fullSlug) ?? 0;
      if (seen > 0) {
        // タイトルが重複した場合は連番サフィックスをつける
        canonicalPath = `${ctx.pathPrefix}${fullSlug}-${seen + 1}`;
      } else {
        canonicalPath = `${ctx.pathPrefix}${fullSlug}`;
      }
      appdxSlugSeen.set(fullSlug, seen + 1);
    } else {
      // タイトルから slug を生成できない場合はフォールバック連番
      canonicalPath = `${ctx.pathPrefix}appdx-${seq}`;
    }

    const body = bodyOf(node, [`${tag}Title`]);
    pushSegment(
      canonicalPath,
      title,
      "TABLE",
      title,
      body,
      ctx,
      ctx.amendLawNum,
    );
    consumed.add(node);
  }

  function walk(node: LawNode, ctx: WalkCtx): void {
    for (const c of node.children ?? []) {
      if (typeof c === "string") continue;
      switch (c.tag) {
        case "TOC":
          consumed.add(c);
          break;
        case "Article":
          pushArticle(c, ctx);
          break;
        case "Paragraph":
          // LawBody 直下の Paragraph（非常に稀だが念のため）
          pushParagraph(c, `${ctx.pathPrefix}body`, "", ctx);
          break;
        case "SupplProvision": {
          // 附則は改正法ごとに複数存在し、それぞれが第1条を持つ。
          // 改正法令番号で名前空間を切らないと canonical_path が衝突する。
          const amend = c.attr?.AmendLawNum;
          walk(c, {
            ...ctx,
            inSuppl: true,
            pathPrefix: `${ctx.pathPrefix}suppl:${amend ?? "original"}/`,
            amendLawNum: amend,
          });
          break;
        }
        case "Part":
        case "Chapter":
        case "Section":
        case "Subsection":
        case "Division":
        case "MainProvision":
          walk(c, ctx);
          break;
        case "AppdxTable":
        case "AppdxNote":
        case "Appdx":
        case "AppdxStyle":
        case "AppdxFig":
        case "AppdxFormat":
          pushAppdx(c, ctx);
          break;
        default:
          walk(c, ctx);
      }
    }
  }

  walk(lawBody, {
    inSuppl: false,
    pathPrefix: "",
    anchorPrefix,
  });

  // 抽出率計測: 分母は「本文になりうるテキスト」に限る
  function bodyTextLength(node: LawNode | string): number {
    if (typeof node === "string") return node.replace(/\s/g, "").length;
    if (NON_BODY_TAGS.has(node.tag)) return 0;
    return (node.children ?? []).reduce(
      (a, c) => a + bodyTextLength(c),
      0,
    );
  }

  const totalChars = bodyTextLength(lawBody);

  return { segments, consumed, totalChars };
}

// === Validation ===
// 設計書 §8.3 の検証項目のうち、Parser 出力に対して検査できるもの。

/**
 * Parser 出力の Validation を行う。
 * 設計書 §8.3 の検証項目のうち、Parser レベルで検出可能なものを実装。
 *
 * 検出する問題:
 *  - canonical_path の重複
 *  - citation_anchor の重複
 *  - 本文が空の PARAGRAPH / ITEM（条の見出しのみの ARTICLE は除外）
 *  - canonical_path 末端に漢数字が残存
 */
export function validateSegments(segments: ProvisionSegment[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. canonical_path の重複（§8.3: Anchor の重複）
  const pathCounts = new Map<string, number>();
  for (const s of segments) {
    pathCounts.set(s.canonicalPath, (pathCounts.get(s.canonicalPath) ?? 0) + 1);
  }
  const dupPaths = [...pathCounts.entries()].filter(([, n]) => n > 1);
  for (const [path, count] of dupPaths) {
    errors.push({
      level: "error",
      message: `canonical_path 重複: ${path} (${count}件)`,
    });
  }

  // 2. citation_anchor の重複
  const anchorCounts = new Map<string, number>();
  for (const s of segments) {
    anchorCounts.set(
      s.citationAnchor,
      (anchorCounts.get(s.citationAnchor) ?? 0) + 1,
    );
  }
  const dupAnchors = [...anchorCounts.entries()].filter(([, n]) => n > 1);
  for (const [anchor, count] of dupAnchors) {
    errors.push({
      level: "error",
      message: `citation_anchor 重複: ${anchor} (${count}件)`,
    });
  }

  // 3. 本文が空の PARAGRAPH / ITEM（§8.3: 本文が空、または極端に短い）
  //    ARTICLE は子 Paragraph が本文を持つため空で問題ない
  const emptyBody = segments.filter(
    (s) =>
      (s.provisionType === "PARAGRAPH" || s.provisionType === "ITEM") &&
      s.body.length === 0,
  );
  for (const s of emptyBody) {
    errors.push({
      level: "warning",
      message: `本文が空: ${s.canonicalPath} (${s.provisionType})`,
    });
  }

  // 4. canonical_path 末端に漢数字が残存
  //    Num 属性の漢数字が未変換で残っている場合を検出
  for (const s of segments) {
    const lastSegment = s.canonicalPath.split("/").pop() ?? "";
    // art, para, item のプレフィックスを除去した残りに漢数字があるか
    const numPart = lastSegment.replace(/^(art|para|item)/, "");
    if ([...numPart].some((ch) => KANJI_NUM.includes(ch))) {
      errors.push({
        level: "error",
        message: `canonical_path 末端に漢数字残存: ${s.canonicalPath}`,
      });
    }
  }

  return errors;
}
