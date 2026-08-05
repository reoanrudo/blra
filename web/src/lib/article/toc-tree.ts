import { formatStructuredNumber } from "@/lib/article/legal-number-format";
import { formatTitleNumber } from "@/lib/article/article";

export interface TocNode {
  id: string;
  parentId: string | null;
  level: string;
  title: string | null;
  articleNumber: string | null;
  caption: string | null;
  sortOrder: number;
  depth: number;
  path: number[];
  textFirstLine: string | null;
  paragraphNumber: string | null;
}

/**
 * caption を安全に括弧で包む。
 * caption が既に括弧で始まる場合は外側の括弧を追加しない（設計書§4.1 二重括弧解消）。
 */
function wrapCaption(caption: string): string {
  const trimmed = caption.trim();
  // 全角・半角括弧で始まる場合はそのまま返す
  if (/^[（(].*[)）]$/.test(trimmed)) return trimmed;
  return `（${trimmed}）`;
}

export function nodeLabel(node: TocNode): string {
  switch (node.level) {
    case "chapter":
      return node.title
        ? formatTitleNumber(node.title)
        : `第${formatStructuredNumber(node.articleNumber)}章`;
    case "section":
      return node.title
        ? formatTitleNumber(node.title)
        : `第${formatStructuredNumber(node.articleNumber)}節`;
    case "subsection":
      return node.title
        ? formatTitleNumber(node.title)
        : `第${formatStructuredNumber(node.articleNumber)}款`;
    case "article": {
      const num = formatStructuredNumber(node.articleNumber);
      if (node.caption) return `第${num}条${wrapCaption(node.caption)}`;
      return `第${num}条`;
    }
    case "appdx_table": {
      // 実データでは title="null", articleNumber="null"。
      // textFirstLine に「別表第一」等が入っているため、それをそのまま使用。
      const label = node.textFirstLine?.trim() ?? "";
      if (label && label !== "null") return label;
      if (node.title && node.title !== "null") return node.title;
      if (node.articleNumber && node.articleNumber !== "null") {
        return `別表第${formatStructuredNumber(node.articleNumber)}`;
      }
      return "別表";
    }
    case "table_struct":
      return node.title ?? (node.articleNumber ? `別表第${formatStructuredNumber(node.articleNumber)} 構造` : "別表 構造");
    case "table":
      return node.title ?? "表";
    case "suppl_provision":
      return node.title ?? "附則";
    case "supplement_group":
      return node.title ?? "附則・経過措置";
    case "paragraph":
      if (node.title) return node.title;
      if (node.textFirstLine) return node.textFirstLine;
      if (node.paragraphNumber) return node.paragraphNumber;
      return "";
    default:
      return node.title ?? node.caption ?? node.textFirstLine ?? "条文";
  }
}

export function nodeCategory(level: string): string {
  if (["chapter", "section", "subsection", "article"].includes(level)) return "main";
  if (["appdx_table", "table_struct", "table"].includes(level)) return "appendix";
  if (["supplement_group", "suppl_provision"].includes(level)) return "supplement";
  if (level === "paragraph") return "supplement-item";
  return "other";
}

const expandableTocLevels = new Set([
  "chapter",
  "section",
  "subsection",
  "supplement_group",
  "suppl_provision",
]);

export function isExpandableTocLevel(level: string): boolean {
  return expandableTocLevels.has(level);
}

export function shouldExpandTocNodeByDefault(node: TocNode): boolean {
  return node.depth === 0 && node.level !== "supplement_group";
}

export function getAncestorIds(nodes: TocNode[], targetId: string): Set<string> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const ancestors = new Set<string>();
  let current = nodeMap.get(targetId);
  while (current && current.parentId) {
    ancestors.add(current.parentId);
    current = nodeMap.get(current.parentId);
  }
  return ancestors;
}

/**
 * nodeMap を外部から渡す getAncestorIds。
 * nodes が変わらない限り同じ nodeMap を使い回せるため、
 * スクロールのたびに725ノードのMapを再構築するオーバーヘッドを回避する。
 */
export function getAncestorIdsWithMap(
  nodeMap: Map<string, TocNode>,
  targetId: string,
): Set<string> {
  const ancestors = new Set<string>();
  let current = nodeMap.get(targetId);
  while (current && current.parentId) {
    ancestors.add(current.parentId);
    current = nodeMap.get(current.parentId);
  }
  return ancestors;
}
