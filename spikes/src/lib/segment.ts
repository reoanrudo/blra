/**
 * 法令標準XML → Provision への分解（F-2 検証用）。
 *
 * 設計書 §6.1 の canonical_path と stable_label を生成し、
 * §8.3 の Validation に相当する検査を行う。
 *
 * ここでの目的は「取りこぼしがどこで、どれだけ出るか」を測ることであり、
 * 本実装のパーサではない。
 *
 * 実測で判明した構造上の注意（s0-findings/F-2-parser.md）:
 *  - Item の子は Subitem1、Subitem1 の子は Subitem2（階層とタグ番号が1ずれる）
 *  - 条文の本文は ParagraphSentence だけでなく TableStruct / Column にも入る
 *  - SupplProvision は改正法ごとに複数存在し、それぞれが第1条を持つ
 */

import { textOf, type LawNode } from "./egov.js";

export type ProvisionType =
  | "ARTICLE"
  | "PARAGRAPH"
  | "ITEM"
  | "TABLE"
  | "SUPPLEMENTARY";

export type Provision = {
  canonicalPath: string;
  stableLabel: string;
  provisionType: ProvisionType;
  heading: string;
  body: string;
  inSupplementary: boolean;
  /** 附則の場合、その附則を置いた改正法令番号 */
  amendLawNum?: string;
  sequence: number;
};

export type SegmentResult = {
  provisions: Provision[];
  uncaptured: { tag: string; chars: number; sample: string }[];
  totalChars: number;
  capturedChars: number;
};

const KANJI = "〇一二三四五六七八九";

/**
 * 分母から除くタグ。
 * 見出し・番号・目次はナビゲーション情報であり Provision の本文ではない。
 * 条項番号は stable_label へ、見出しは heading へ入るため二重計上しない。
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

function numToLabel(num: string): string {
  return num.split("_").join("の");
}

function numToPath(num: string): string {
  return num.split("_").join("-");
}

function attrNum(node: LawNode): string {
  return node.attr?.Num ?? "";
}

function childrenOf(node: LawNode, ...tags: string[]): LawNode[] {
  const out: LawNode[] = [];
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    if (tags.includes(c.tag)) out.push(c);
  }
  return out;
}

function firstChild(node: LawNode, tag: string): LawNode | undefined {
  return childrenOf(node, tag)[0];
}

/**
 * 直下の子のうち、除外タグと指定タグを除いた全テキストを連結する。
 * ParagraphSentence だけを見ると条文内の表（TableStruct）を落とすため、
 * 「残り全部を取る」方式にする。
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

export function segment(lawBody: LawNode): SegmentResult {
  const provisions: Provision[] = [];
  const consumed = new Set<LawNode>();
  let seq = 0;

  /**
   * @param level 0 = Item、n>=1 = Subitem{n}
   */
  function pushItem(
    node: LawNode,
    parentPath: string,
    parentLabel: string,
    level: number,
    ctx: Ctx,
  ) {
    const num = attrNum(node);
    const titleTag = level === 0 ? "ItemTitle" : `Subitem${level}Title`;
    const sentenceTag = level === 0 ? "ItemSentence" : `Subitem${level}Sentence`;
    const childTag = `Subitem${level + 1}`;

    const titleNode = firstChild(node, titleTag);
    const title = titleNode ? textOf(titleNode).trim() : numToLabel(num);
    const path = `${parentPath}/item${numToPath(num)}`;
    const label = `${parentLabel}第${title}号`;

    provisions.push({
      canonicalPath: path,
      stableLabel: label,
      provisionType: "ITEM",
      heading: "",
      body: bodyOf(node, [childTag]),
      inSupplementary: ctx.inSuppl,
      amendLawNum: ctx.amendLawNum,
      sequence: seq++,
    });
    consumed.add(node);

    for (const sub of childrenOf(node, childTag)) {
      consumed.delete(sub);
      pushItem(sub, path, label, level + 1, ctx);
    }
    void sentenceTag;
  }

  function pushParagraph(
    node: LawNode,
    parentPath: string,
    parentLabel: string,
    ctx: Ctx,
  ) {
    const num = attrNum(node) || "1";
    const path = `${parentPath}/para${numToPath(num)}`;
    const label = `${parentLabel}第${num}項`;
    const caption = firstChild(node, "ParagraphCaption");

    provisions.push({
      canonicalPath: path,
      stableLabel: label,
      provisionType: "PARAGRAPH",
      heading: caption ? textOf(caption).trim() : "",
      body: bodyOf(node, ["Item", "ParagraphCaption"]),
      inSupplementary: ctx.inSuppl,
      amendLawNum: ctx.amendLawNum,
      sequence: seq++,
    });
    consumed.add(node);

    for (const item of childrenOf(node, "Item")) {
      consumed.delete(item);
      pushItem(item, path, label, 0, ctx);
    }
  }

  function pushArticle(node: LawNode, ctx: Ctx) {
    const num = attrNum(node);
    const path = `${ctx.pathPrefix}art${numToPath(num)}`;
    const label = `第${numToLabel(num)}条`;
    const caption = firstChild(node, "ArticleCaption");

    provisions.push({
      canonicalPath: path,
      stableLabel: label,
      provisionType: ctx.inSuppl ? "SUPPLEMENTARY" : "ARTICLE",
      heading: caption ? textOf(caption).trim() : "",
      body: "",
      inSupplementary: ctx.inSuppl,
      amendLawNum: ctx.amendLawNum,
      sequence: seq++,
    });
    consumed.add(node);

    for (const p of childrenOf(node, "Paragraph")) {
      consumed.delete(p);
      pushParagraph(p, path, label, ctx);
    }
  }

  type Ctx = { inSuppl: boolean; pathPrefix: string; amendLawNum?: string };

  function walk(node: LawNode, ctx: Ctx) {
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
          pushParagraph(c, `${ctx.pathPrefix}body`, "", ctx);
          break;
        case "SupplProvision": {
          // 附則は改正法ごとに複数存在し、それぞれが第1条を持つ。
          // 改正法令番号で名前空間を切らないと canonical_path が衝突する。
          const amend = c.attr?.AmendLawNum;
          walk(c, {
            inSuppl: true,
            pathPrefix: `suppl:${amend ?? "original"}/`,
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
        case "AppdxFormat": {
          const t = firstChild(c, `${c.tag}Title`);
          const title = t ? textOf(t).trim() : c.tag;
          provisions.push({
            canonicalPath: `${ctx.pathPrefix}appdx${seq}`,
            stableLabel: title,
            provisionType: "TABLE",
            heading: title,
            body: bodyOf(c, [`${c.tag}Title`]),
            inSupplementary: ctx.inSuppl,
            amendLawNum: ctx.amendLawNum,
            sequence: seq++,
          });
          consumed.add(c);
          break;
        }
        default:
          walk(c, ctx);
      }
    }
  }

  walk(lawBody, { inSuppl: false, pathPrefix: "" });

  // 取りこぼし計測
  const uncapturedMap = new Map<string, { chars: number; sample: string }>();
  function scanUncaptured(node: LawNode | string, parentTag: string) {
    if (typeof node === "string") {
      const t = node.trim();
      if (!t) return;
      const cur = uncapturedMap.get(parentTag) ?? { chars: 0, sample: "" };
      cur.chars += t.replace(/\s/g, "").length;
      if (!cur.sample) cur.sample = t.slice(0, 40);
      uncapturedMap.set(parentTag, cur);
      return;
    }
    if (consumed.has(node)) return;
    if (NON_BODY_TAGS.has(node.tag)) return;
    for (const c of node.children ?? []) scanUncaptured(c, node.tag);
  }
  scanUncaptured(lawBody, "LawBody");

  // 分母は「本文になりうるテキスト」に限る（見出し・番号・目次を除く）
  function bodyTextLength(node: LawNode | string): number {
    if (typeof node === "string") return node.replace(/\s/g, "").length;
    if (NON_BODY_TAGS.has(node.tag)) return 0;
    return (node.children ?? [])
      .map(bodyTextLength)
      .reduce((a, b) => a + b, 0);
  }

  const totalChars = bodyTextLength(lawBody);
  const capturedChars = provisions
    .map((p) => (p.heading + p.body).replace(/\s/g, "").length)
    .reduce((a, b) => a + b, 0);

  const uncaptured = [...uncapturedMap.entries()]
    .map(([tag, v]) => ({ tag, ...v }))
    .sort((a, b) => b.chars - a.chars);

  return { provisions, uncaptured, totalChars, capturedChars };
}

export function validate(provisions: Provision[]): string[] {
  const errors: string[] = [];

  const paths = new Map<string, number>();
  for (const p of provisions) {
    paths.set(p.canonicalPath, (paths.get(p.canonicalPath) ?? 0) + 1);
  }
  const dupes = [...paths].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    errors.push(
      `canonical_path の重複 ${dupes.length} 種（例: ${dupes
        .slice(0, 3)
        .map(([p, n]) => `${p}×${n}`)
        .join(", ")}）`,
    );
  }

  const leaves = provisions.filter(
    (p) => p.provisionType === "PARAGRAPH" || p.provisionType === "ITEM",
  );
  const empty = leaves.filter((p) => p.body.length === 0);
  if (empty.length > 0) {
    errors.push(
      `本文が空の条項が ${empty.length} 件（例: ${empty
        .slice(0, 3)
        .map((p) => p.canonicalPath)
        .join(", ")}）`,
    );
  }

  const kanjiInPath = provisions.filter((p) =>
    [...p.canonicalPath.split("/").pop()!].some((ch) => KANJI.includes(ch)),
  );
  if (kanjiInPath.length > 0) {
    errors.push(
      `canonical_path の末端に漢数字が残存: ${kanjiInPath.length} 件（例: ${kanjiInPath[0]?.canonicalPath}）`,
    );
  }

  return errors;
}
