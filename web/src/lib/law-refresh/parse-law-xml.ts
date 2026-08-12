import { createHash } from "crypto";
import type { ArticleLevel } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import { normalizeArticleNumber } from "@/lib/article/normalize-article";
import { computeArticleContentChecksum } from "../../../scripts/lib/article-content-checksum";
import {
  supplementaryProvisionMetadataFromNode,
  supplementaryProvisionSystemTags,
  supplementaryProvisionTitle,
} from "../../../scripts/lib/supplementary-provision";
import type {
  ArticleRow,
  ParsedLawDocument,
  ParsedLawNode,
  ParseLawContext,
  TableCellStyle,
} from "./types";

const TAG_TO_LEVEL: Record<string, ArticleLevel> = {
  Chapter: "chapter",
  Section: "section",
  Subsection: "subsection",
  Article: "article",
  Paragraph: "paragraph",
  Item: "item",
  Subitem1: "subitem1",
  Subitem2: "subitem2",
  Subitem3: "subitem3",
  Column: "column",
  TableStruct: "table_struct",
  Table: "table",
  AppdxTable: "appdx_table",
  TableRow: "table_row",
  TableColumn: "table_column",
  SupplProvision: "suppl_provision",
};

const SKIP_LEVEL_TAGS = new Set([
  // Ruby は parseLawXml の前処理（stripRuby）で親字に展開済み。
  // Rt は万が一残った場合の安全網として読み仮名を除外する。
  "Rt",
  "Rp",
]);

const ARRAY_TAGS = new Set([
  ...Object.keys(TAG_TO_LEVEL),
  "Sentence",
  "ListSentence",
  "ParagraphSentence",
  "ItemSentence",
  "Subitem1Sentence",
  "Subitem2Sentence",
  "Subitem3Sentence",
  "TOCChapter",
  "TOCSection",
  "TOCSubsection",
  "List",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function bodyChecksum(node: {
  level: ArticleLevel;
  title: string | null;
  caption: string | null;
  text: string | null;
  systemTags: Record<string, unknown> | null;
}): string {
  return sha256(JSON.stringify(canonicalize(node)));
}

function extractTextRecursive(node: unknown): string {
  if (typeof node === "string") return node.trim();
  if (!isRecord(node)) return "";
  if (typeof node["#text"] === "string") return node["#text"].trim();

  const texts: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "#text" || key.startsWith("@_")) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const text = extractTextRecursive(item);
      if (text) texts.push(text);
    }
  }
  return texts.join("").trim();
}

const BODY_NUMBER_AND_TITLE_TAGS = new Set([
  "ArticleTitle",
  "ArticleCaption",
  "ParagraphNum",
  "ItemTitle",
  "Subitem1Title",
  "Subitem2Title",
  "Subitem3Title",
  "ChapterTitle",
  "SectionTitle",
  "SubsectionTitle",
  "SupplProvisionLabel",
]);

function extractTextFromNode(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isRecord(node)) return "";

  const texts: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "#text" || key.startsWith("@_")) continue;
    if (SKIP_LEVEL_TAGS.has(key) || TAG_TO_LEVEL[key] !== undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const text = extractTextRecursive(item);
      if (text) texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

function extractBodyTextFromNode(node: unknown): string {
  if (typeof node === "string") return node;
  if (!isRecord(node)) return "";

  const texts: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "#text" ||
      key.startsWith("@_") ||
      BODY_NUMBER_AND_TITLE_TAGS.has(key) ||
      SKIP_LEVEL_TAGS.has(key) ||
      TAG_TO_LEVEL[key] !== undefined
    ) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const text = extractTextRecursive(item);
      if (text) texts.push(text);
    }
  }
  return texts.join("\n").trim();
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  const text = extractTextFromNode(value).trim();
  return text || null;
}

function normalizeSemanticNumber(value: string | null): string | null {
  if (!value) return null;
  const normalizedSeparators = value.replaceAll("_", "の");
  return normalizeArticleNumber(normalizedSeparators) ?? normalizedSeparators;
}

function normalizeFingerprintTitle(value: string | null): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeScalarText(value: unknown): string {
  return String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

interface CanonicalXmlSubtree {
  officialAttributes: Record<string, string>;
  text: string | null;
  children: Array<{
    tag: string;
    values: CanonicalXmlSubtree[];
  }>;
}

function canonicalXmlSubtree(value: unknown): CanonicalXmlSubtree {
  if (!isRecord(value)) {
    return {
      officialAttributes: {},
      text: value === undefined || value === null
        ? null
        : normalizeScalarText(value),
      children: [],
    };
  }

  const officialAttributes = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.startsWith("@_"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, attributeValue]) => [key, normalizeScalarText(attributeValue)]),
  );
  const rawText = value["#text"];
  const text = rawText === undefined || rawText === null
    ? null
    : normalizeScalarText(rawText);
  const children = Object.entries(value)
    .filter(([key]) => key !== "#text" && !key.startsWith("@_"))
    .map(([tag, childValue]) => ({
      tag,
      values: (Array.isArray(childValue) ? childValue : [childValue]).map(
        canonicalXmlSubtree,
      ),
    }));

  return { officialAttributes, text, children };
}

function canonicalSubtreeFingerprint(value: unknown): string {
  return sha256(JSON.stringify(canonicalXmlSubtree(value)));
}

function officialAttributes(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key.startsWith("@_"))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeKeyValue(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").replaceAll("/", "%2F");
}

function titleFor(tag: string, item: Record<string, unknown>): string | null {
  if (tag === "Chapter" || tag === "Section" || tag === "Subsection") {
    return textValue(item[`${tag}Title`]);
  }
  if (tag === "SupplProvision") {
    return supplementaryProvisionTitle(supplementaryProvisionMetadataFromNode(item));
  }
  return null;
}

function supplementSegment(
  item: Record<string, unknown>,
  promulgationKey: string,
): string {
  const metadata = supplementaryProvisionMetadataFromNode(item);
  const source = metadata.amendLawNum ?? `promulgated:${promulgationKey}`;
  return `suppl_provision:${normalizeKeyValue(source)}`;
}

function numberedSegment(node: ParsedLawNode): string | null {
  if (node.level === "table_row" || node.level === "table_column") {
    return null;
  }
  const value =
    node.level === "article"
      ? node.articleNumberNormalized
      : node.level === "paragraph"
        ? node.paragraphNumber
        : node.level === "item"
          ? node.itemNumber
          : node.level.startsWith("subitem")
            ? node.subitemNumber
            : node.articleNumber;
  return value ? `${node.level}:${normalizeKeyValue(value)}` : null;
}

function fallbackSegment(
  tag: string,
  item: Record<string, unknown>,
  node: ParsedLawNode,
): string {
  const semanticTitle = textValue(item[`${tag}Title`]) ?? node.title;
  const isTableElement =
    node.level === "table_row" || node.level === "table_column";
  const fingerprintInput: Record<string, unknown> = {
    tag,
    officialAttributes: officialAttributes(item),
    title: normalizeFingerprintTitle(semanticTitle),
    caption: normalizeFingerprintTitle(node.caption),
    text: normalizeFingerprintTitle(node.text),
    bodyChecksum: node.bodyChecksum,
  };
  if (isTableElement) {
    fingerprintInput.subtreeFingerprint = canonicalSubtreeFingerprint(item);
  }
  const fingerprint = sha256(
    JSON.stringify(canonicalize(fingerprintInput)),
  );
  return `${node.level}:fingerprint:${fingerprint}`;
}

function promulgationKey(law: Record<string, unknown>): string {
  const era = String(law["@_Era"] ?? "unknown");
  const year = String(law["@_Year"] ?? "unknown");
  const month = String(law["@_PromulgateMonth"] ?? "unknown");
  const day = String(law["@_PromulgateDay"] ?? "unknown");
  return `${era}-${year}-${month}-${day}`;
}

/**
 * e-Gov XML の TableColumn 要素から罫線・結合属性を抽出する。
 *
 * 罫線は4辺それぞれ BorderTop/BorderRight/BorderBottom/BorderLeft 属性で
 * "solid"/"none" が指定される。省略時は "none"。
 * colspan/rowspan は小文字属性名（e-Gov実データ）で数値文字列が指定される。
 * 省略時は 1。
 */
function extractTableCellStyle(value: Record<string, unknown>): TableCellStyle {
  const borderAttr = (key: string): "solid" | "none" =>
    value[`@_${key}`] === "solid" ? "solid" : "none";
  const spanAttr = (key: string): number => {
    const raw = value[`@_${key}`];
    if (typeof raw !== "string") return 1;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  };
  return {
    borderTop: borderAttr("BorderTop"),
    borderRight: borderAttr("BorderRight"),
    borderBottom: borderAttr("BorderBottom"),
    borderLeft: borderAttr("BorderLeft"),
    colspan: spanAttr("colspan"),
    rowspan: spanAttr("rowspan"),
  };
}

/**
 * e-Gov XML のルビ要素（<Ruby>親字<Rt>読み</Rt></Ruby>）を親字のみに展開する。
 *
 * fast-xml-parser は preserveOrder: false のため、
 * <Sentence>前文<Ruby>跨<Rt>こ</Rt></Ruby>後文</Sentence> を
 * { "#text": "前文後文", "Ruby": { "#text": "跨", "Rt": "こ" } }
 * と前後テキストを結合してしまい、親字の挿入位置が失われる。
 * XML パース前に正規表現で親字を本文へ埋め込むことで、
 * 正しい順序「前文跨後文」を保持したままルビの読み仮名を除外する。
 */
const RUBY_PATTERN =
  /<Ruby>\s*([^<]+?)\s*(?:<Rp>[^<]*<\/Rp>\s*)?<Rt>[^<]*<\/Rt>\s*(?:<Rp>[^<]*<\/Rp>\s*)?<\/Ruby>/g;

function stripRuby(xml: string): string {
  return xml.replace(RUBY_PATTERN, "$1");
}

/**
 * fast-xml-parser は preserveOrder: false のとき、添字・上付き文字を
 * 本文の末尾へまとめてしまい、位置を復元できない。パース前にプレーンテキストの
 * 表記へ置換して、親字と添字の対応を維持する。
 *
 * <ArithFormula> 内だけでなく、定義部分（「この式において…」）など
 * <ArithFormula> の外にある <Sub>/<Sup> も変換する。
 * 例: Ａ<Sub>ｖ</Sub> → Ａ_ｖ
 */
function preserveArithFormulaMarkup(xml: string): string {
  return xml
    .replace(/<Sub>([\s\S]*?)<\/Sub>/g, "_$1")
    .replace(/<Sup>([\s\S]*?)<\/Sup>/g, "^$1");
}

export function parseLawXml(
  xml: string,
  context: ParseLawContext,
): ParsedLawDocument {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name: string) => ARRAY_TAGS.has(name),
    removeNSPrefix: true,
    textNodeName: "#text",
    preserveOrder: false,
  });
  const parsed = parser.parse(preserveArithFormulaMarkup(stripRuby(xml))) as unknown;
  if (!isRecord(parsed)) throw new Error("XML root must be an object");

  const dataRoot = isRecord(parsed.DataRoot) ? parsed.DataRoot : null;
  const applData = dataRoot && isRecord(dataRoot.ApplData) ? dataRoot.ApplData : null;
  const lawFullText = applData && isRecord(applData.LawFullText)
    ? applData.LawFullText
    : null;
  const law = isRecord(parsed.Law)
    ? parsed.Law
    : lawFullText && isRecord(lawFullText.Law)
      ? lawFullText.Law
      : null;
  if (!law) throw new Error("Missing Law");

  const lawBody = isRecord(law.LawBody) ? law.LawBody : null;
  if (!lawBody) throw new Error("Missing LawBody");

  const nodes: ParsedLawNode[] = [];
  const siblingSegments = new Map<string, Set<string>>();
  const duplicateTableGroups = new Map<
    string,
    { count: number }
  >();
  const sortOrders = new Map<number | null, number>();
  let supplementaryIndex = 0;

  const walk = (
    source: unknown,
    parentSourceIndex: number | null,
    parentDurableKey: string,
    inSupplementaryProvision: boolean,
  ): void => {
    if (!isRecord(source)) return;

    for (const [tag, rawValue] of Object.entries(source)) {
      if (tag === "#text" || tag.startsWith("@_")) continue;

      const level = TAG_TO_LEVEL[tag];
      if (level === undefined) {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const value of values) {
          walk(value, parentSourceIndex, parentDurableKey, inSupplementaryProvision);
        }
        continue;
      }

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (!isRecord(value)) continue;

        if (tag === "SupplProvision") supplementaryIndex++;
        const isSupplementary = inSupplementaryProvision || tag === "SupplProvision";
        const sourceIndex = nodes.length;
        const sortOrder = (sortOrders.get(parentSourceIndex) ?? 0) + 1;
        sortOrders.set(parentSourceIndex, sortOrder);

        const rawNumber = typeof value["@_Num"] === "string"
          ? value["@_Num"]
          : null;
        let effectiveArticleNumber = rawNumber;
        if (tag === "Article") {
          const match = textValue(value.ArticleTitle)?.match(/第(.+)$/);
          if (match) effectiveArticleNumber = match[1].replace(/条/g, "");
        }

        const articleNumberNormalized = tag === "Article"
          ? normalizeArticleNumber(
              isSupplementary && effectiveArticleNumber
                ? `附則${supplementaryIndex}_${effectiveArticleNumber}`
                : effectiveArticleNumber ?? undefined,
            ) ?? null
          : null;
        const paragraphNumber = tag === "Paragraph" && value.ParagraphNum !== undefined
          ? textValue(value.ParagraphNum)
          : null;
        const itemNumber = tag === "Item" && value.ItemTitle !== undefined
          ? textValue(value.ItemTitle)
          : null;
        const subitemNumber = tag.startsWith("Subitem") && value[`${tag}Title`] !== undefined
          ? textValue(value[`${tag}Title`])
          : null;
        const title = titleFor(tag, value);
        const caption = tag === "Article"
          ? textValue(value.ArticleCaption)
          : null;
        const text = extractTextFromNode(value) || null;
        const systemTags = tag === "SupplProvision"
          ? supplementaryProvisionSystemTags(
              supplementaryProvisionMetadataFromNode(value),
            )
          : null;
        const checksumInput = {
          level,
          title,
          caption,
          text: extractBodyTextFromNode(value) || null,
          systemTags,
        };
        const parsedNode: ParsedLawNode = {
          sourceIndex,
          parentSourceIndex,
          level,
          legacyStableNodeKey: "",
          durableNodeKey: "",
          contentChecksum: computeArticleContentChecksum({
            level,
            articleNumber: articleNumberNormalized,
            paragraphNumber,
            itemNumber,
            subitemNumber,
            title,
            caption,
            text,
            systemTags,
          }),
          bodyChecksum: bodyChecksum(checksumInput),
          articleNumber: tag === "Article" ? effectiveArticleNumber : rawNumber,
          articleNumberNormalized,
          paragraphNumber,
          itemNumber,
          subitemNumber,
          title,
          caption,
          text,
          sortOrder,
          systemTags,
          tableCellMeta: tag === "TableColumn" ? extractTableCellStyle(value) : null,
        };

        const durableArticleNumber = tag === "Article"
          ? normalizeSemanticNumber(effectiveArticleNumber)
          : null;
        const durableChildNumber = tag === "Paragraph"
          ? paragraphNumber ?? normalizeSemanticNumber(rawNumber)
          : tag === "Item"
            ? itemNumber ?? normalizeSemanticNumber(rawNumber)
            : tag.startsWith("Subitem")
              ? subitemNumber ?? normalizeSemanticNumber(rawNumber)
              : null;
        const segment = tag === "SupplProvision"
          ? supplementSegment(value, promulgationKey(law))
          : durableArticleNumber
            ? `article:${normalizeKeyValue(durableArticleNumber)}`
            : durableChildNumber
              ? `${level}:${normalizeKeyValue(durableChildNumber)}`
            : numberedSegment(parsedNode) ?? fallbackSegment(tag, value, parsedNode);
        const siblingKey = parentSourceIndex === null
          ? parentDurableKey
          : String(parentSourceIndex);
        const usedSegments = siblingSegments.get(siblingKey) ?? new Set<string>();
        let durableNodeKey = `${parentDurableKey}/${segment}`;
        if (usedSegments.has(segment)) {
          const canDisambiguateDuplicate =
            level === "table_row" ||
            level === "table_column" ||
            level === "column" ||
            context.tolerateDuplicateDurableKeys === true;
          if (!canDisambiguateDuplicate) {
            throw new Error(
              `Duplicate durable node fingerprint under ${parentDurableKey}: ${segment}`,
            );
          }

          const groupKey = `${siblingKey}\u0000${segment}`;
          const group = duplicateTableGroups.get(groupKey)!;
          group.count++;
          if (group.count === 2) {
            const firstKey = durableNodeKey;
            const firstOccurrenceKey = `${firstKey}/occurrence:1`;
            // 完全同一の表要素は意味的に区別不能なため、この同一multiset内だけ
            // occurrenceをtie-breakerにする。非同一兄弟の挿入・並べ替えは影響しない。
            for (const existingNode of nodes) {
              if (
                existingNode.durableNodeKey === firstKey ||
                existingNode.durableNodeKey.startsWith(`${firstKey}/`)
              ) {
                existingNode.durableNodeKey =
                  `${firstOccurrenceKey}${existingNode.durableNodeKey.slice(firstKey.length)}`;
              }
            }
          }
          durableNodeKey = `${durableNodeKey}/occurrence:${group.count}`;
        } else {
          usedSegments.add(segment);
          siblingSegments.set(siblingKey, usedSegments);
          if (
            level === "table_row" ||
            level === "table_column" ||
            level === "column" ||
            context.tolerateDuplicateDurableKeys === true
          ) {
            duplicateTableGroups.set(`${siblingKey}\u0000${segment}`, {
              count: 1,
            });
          }
        }

        parsedNode.durableNodeKey = durableNodeKey;
        const parentLegacyKey = parentSourceIndex === null
          ? "root"
          : nodes[parentSourceIndex].legacyStableNodeKey;
        const semanticNumber =
          parsedNode.articleNumberNormalized ??
          parsedNode.paragraphNumber ??
          parsedNode.itemNumber ??
          parsedNode.subitemNumber ??
          (parsedNode.level === "column" ? parsedNode.articleNumber : null) ??
          (parsedNode.level === "table_row" || parsedNode.level === "table_column"
            ? parsedNode.articleNumber
            : null) ??
          String(sortOrder);
        parsedNode.legacyStableNodeKey =
          `${parentLegacyKey}/${level}:${semanticNumber}@${sortOrder}`;
        nodes.push(parsedNode);
        walk(value, sourceIndex, parsedNode.durableNodeKey, isSupplementary);
      }
    }
  };

  if (lawBody.MainProvision !== undefined) {
    walk(lawBody.MainProvision, null, "main", false);
  }
  if (lawBody.SupplProvision !== undefined) {
    walk({ SupplProvision: lawBody.SupplProvision }, null, "supplementary", true);
  }
  if (lawBody.AppdxTable !== undefined) {
    walk({ AppdxTable: lawBody.AppdxTable }, null, "appendix", false);
  }

  return { ...context, nodes };
}

function normalizeCaption(caption: string | null): string | null {
  if (!caption) return null;
  return caption.replace(/^[（(]/, "").replace(/[）)]$/, "").trim() || null;
}

function classifyRegulationType(text: string, isSupplementary: boolean): string {
  if (isSupplementary) return "supplementary";
  if (/[罰刑]金|懲役|過料|拘留/.test(text)) return "penalty";
  if (/手続|申請|認定|許可|認可|届出|登録|検査済証/.test(text)) {
    return "procedure";
  }
  return "individual";
}

export function materializeArticleRows(
  document: ParsedLawDocument,
  idPrefix: string,
): ArticleRow[] {
  const idBySourceIndex = new Map(
    document.nodes.map((node) => [
      node.sourceIndex,
      `${idPrefix}${String(node.sourceIndex + 1).padStart(6, "0")}`,
    ]),
  );

  return document.nodes.map((node) => ({
    id: idBySourceIndex.get(node.sourceIndex)!,
    lawId: document.lawId,
    parentId: node.parentSourceIndex === null
      ? null
      : idBySourceIndex.get(node.parentSourceIndex)!,
    level: node.level,
    articleNumber: node.articleNumber,
    articleNumberNormalized: node.articleNumberNormalized,
    paragraphNumber: node.paragraphNumber,
    itemNumber: node.itemNumber,
    subitemNumber: node.subitemNumber,
    columnNumber: node.level === "column" ? node.articleNumber : null,
    tableCoords:
      node.level === "table_row" || node.level === "table_column"
        ? node.articleNumber
        : null,
    title: node.title,
    caption: node.caption,
    text: node.text,
    articleCaptionNormalized: normalizeCaption(node.caption),
    sortOrder: node.sortOrder,
    regulationType: classifyRegulationType(
      node.text ?? "",
      node.durableNodeKey.startsWith("supplementary/"),
    ),
    systemTags: node.systemTags,
    lawRevisionId: document.revisionId,
    stableNodeKey: node.legacyStableNodeKey,
    durableNodeKey: node.durableNodeKey,
    contentChecksum: node.contentChecksum,
    bodyChecksum: node.bodyChecksum,
    tableMetadata: node.tableCellMeta ? JSON.stringify(node.tableCellMeta) : null,
  }));
}

export type {
  ArticleRow,
  ParsedLawDocument,
  ParsedLawNode,
  ParseLawContext,
  TableCellStyle,
} from "./types";
