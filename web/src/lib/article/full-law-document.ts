import type { ArticleRow, ChapterArticle } from "@/lib/article/article";
import { groupSupplementaryProvisions } from "@/lib/article/toc-supplements";
import type { TocNode } from "@/lib/article/toc-tree";
import type { OutgoingLinkRow } from "@/lib/link/link";

export interface FullLawNode extends Omit<ArticleRow, "lawName"> {
  path: number[];
}

export interface FullLawDocument {
  law: {
    id: string;
    egovLawId: string;
    name: string;
    shortName: string | null;
  };
  revision: {
    id: string;
    editionKey: string;
    sourceDate: string | null;
  };
  toc: TocNode[];
  nodes: FullLawNode[];
  linksBySource: Record<string, OutgoingLinkRow[]>;
}

export type FullLawBlock =
  | { kind: "heading"; node: ArticleRow }
  | { kind: "article"; article: ChapterArticle };

const headingLevels = new Set(["chapter", "section", "subsection"]);
const articleRootLevels = new Set([
  "article",
  "suppl_provision",
  "appdx_table",
]);
const tocLevels = new Set([
  "chapter",
  "section",
  "subsection",
  "article",
  "appdx_table",
  "table_struct",
  "table",
  "suppl_provision",
]);

export function fullLawAnchorId(articleId: string): string {
  return `law-node-${articleId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

export function fullLawTargetSelector(articleId: string): string {
  return `#${fullLawAnchorId(articleId)}`;
}

export function buildFullLawBlocks(
  nodes: FullLawNode[],
  lawName: string,
): FullLawBlock[] {
  const blocks: FullLawBlock[] = [];
  let currentArticle: ChapterArticle | null = null;

  const flushArticle = () => {
    if (!currentArticle) return;
    blocks.push({ kind: "article", article: currentArticle });
    currentArticle = null;
  };

  for (const node of nodes) {
    const articleRow: ArticleRow = { ...node, lawName };

    if (headingLevels.has(node.level)) {
      flushArticle();
      blocks.push({ kind: "heading", node: articleRow });
      continue;
    }

    if (articleRootLevels.has(node.level)) {
      flushArticle();
      currentArticle = { root: articleRow, children: [] };
      continue;
    }

    currentArticle?.children.push(articleRow);
  }

  flushArticle();
  return blocks;
}

export function buildFullLawToc(nodes: FullLawNode[]): TocNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const toc = nodes
    .filter((node) => {
      if (tocLevels.has(node.level)) return true;
      if (node.level !== "paragraph" || !node.parentId) return false;
      return nodeById.get(node.parentId)?.level === "suppl_provision";
    })
    .map<TocNode>((node) => ({
      id: node.id,
      parentId: node.parentId,
      level: node.level,
      title: node.title,
      articleNumber: node.articleNumber,
      caption: node.caption,
      sortOrder: node.sortOrder,
      depth: node.depth,
      path: node.path,
      textFirstLine: node.text?.split("\n", 1)[0] ?? null,
      paragraphNumber: node.paragraphNumber,
    }));

  return groupSupplementaryProvisions(toc, nodes[0]?.lawId ?? "law");
}
