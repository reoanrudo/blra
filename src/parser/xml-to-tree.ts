/**
 * 法令標準XML 文字列 → LawNode 木への変換。
 *
 * e-Gov API の /law_data エンドポイントは、JSON モードでは law_full_text を
 * 既にパース済みの木構造で返すが、XML モード（response_format=xml）や
 * ローカルファイルから読み込む場合は文字列からのパースが必要。
 *
 * spike (spikes/src/lib/egov.ts) の LawNode 型と互換性のある木を生成する。
 * これにより segment() ロジックをそのまま使い回せる。
 */

import { XMLParser } from "fast-xml-parser";

/**
 * 法令標準XML をそのまま写した汎用ノード。
 * spike の spikes/src/lib/egov.ts と同じ構造。
 */
export interface LawNode {
  tag: string;
  attr?: Record<string, string>;
  children?: (LawNode | string)[];
}

/**
 * 法令標準XML で繰り返し出現する要素タグ。
 * これらは常に配列として扱い、要素が1つの場合も配列の要素として処理する。
 * （fast-xml-parser はデフォルトで要素が1つの場合オブジェクトにしてしまうため）
 */
const ARRAY_TAGS = new Set([
  "Chapter",
  "Article",
  "Paragraph",
  "Item",
  "Subitem1",
  "Subitem2",
  "Subitem3",
  "SupplProvision",
  "AppdxTable",
  "AppdxStyle",
  "AppdxNote",
  "Appdx",
  "AppdxFig",
  "AppdxFormat",
  "Part",
  "Section",
  "Subsection",
  "Division",
  "TableStruct",
  "Table",
  "Column",
  "TableColumn",
  "ParagraphSentence",
  "ItemSentence",
  "Subitem1Sentence",
  "Subitem2Sentence",
]);

const parser = new XMLParser({
  // v5 はデフォルトで属性を無視する。属性をパースするために明示的に false にする
  ignoreAttributes: false,
  // 属性名に @_ プレフィックスをつける
  attributeNamePrefix: "@_",
  // テキストノードのキー
  textNodeName: "#text",
  // 繰り返し要素タグは常に配列にする
  isArray: (tagName: string) => ARRAY_TAGS.has(tagName),
  // 数値・真偽値への自動変換を無効化（法令番号の "012" 等が壊れるのを防ぐ）
  parseTagValue: false,
  // trim を無効化（本文中の空白構造を保持。normalizeBody で後で正規化する）
  trimValues: false,
});

/**
 * XML 文字列をパースして LawNode 木を返す。
 *
 * @param xml 法令標準XML 文字列
 * @returns ルートノード（通常は <Law> または <LawBody>）
 * @throws XML がパースできない場合、またはルート要素が見つからない場合
 */
export function parseXml(xml: string): LawNode {
  const parsed = parser.parse(xml);

  // ルート要素のタグ名を特定（通常は "Law"）
  const rootTag = Object.keys(parsed).find(
    (k) => k !== "?xml" && typeof parsed[k] === "object",
  );

  if (!rootTag) {
    throw new Error("XML のルート要素が見つかりません");
  }

  return toLawNode(rootTag, parsed[rootTag]);
}

/**
 * fast-xml-parser の出力オブジェクトを LawNode へ再帰変換する。
 */
function toLawNode(tag: string, value: unknown): LawNode {
  const node: LawNode = { tag };

  if (value === null || value === undefined) {
    return node;
  }

  if (typeof value === "string") {
    node.children = [value];
    return node;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    node.children = [String(value)];
    return node;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const attr: Record<string, string> = {};
    const children: (LawNode | string)[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (key === "#text") {
        if (typeof val === "string") {
          children.push(val);
        }
      } else if (key.startsWith("@_")) {
        attr[key.slice(2)] = String(val);
      } else {
        // 子要素（配列の場合は各要素を展開）
        if (Array.isArray(val)) {
          for (const v of val) {
            children.push(toLawNode(key, v));
          }
        } else {
          children.push(toLawNode(key, val));
        }
      }
    }

    if (Object.keys(attr).length > 0) {
      node.attr = attr;
    }
    if (children.length > 0) {
      node.children = children;
    }
    return node;
  }

  // その他の型（配列のトップレベル等）は通常起こらない
  return node;
}

// === 木操作のユーティリティ（spike/src/lib/egov.ts から移植）===

/**
 * 指定タグの子要素を取得する。
 */
export function childrenOf(node: LawNode, ...tags: string[]): LawNode[] {
  const out: LawNode[] = [];
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    if (tags.includes(c.tag)) out.push(c);
  }
  return out;
}

/**
 * 指定タグの最初の子要素を取得する。
 */
export function firstChild(node: LawNode, tag: string): LawNode | undefined {
  return childrenOf(node, tag)[0];
}

/**
 * ノード配下の全テキストを連結する。
 */
export function textOf(node: LawNode | string): string {
  if (typeof node === "string") return node;
  if (!node.children) return "";
  return node.children.map(textOf).join("");
}

/**
 * 指定タグのノードを深さ優先で探す。
 */
export function findFirst(node: LawNode, tag: string): LawNode | undefined {
  if (node.tag === tag) return node;
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    const hit = findFirst(c, tag);
    if (hit) return hit;
  }
  return undefined;
}
