import type { TocNode } from "@/lib/article/toc-tree";

function comparePath(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

export function groupSupplementaryProvisions(
  nodes: TocNode[],
  lawId: string,
): TocNode[] {
  const supplementRoots = nodes.filter(
    (node) => node.level === "suppl_provision" && node.parentId === null,
  );
  if (supplementRoots.length === 0) return nodes;

  const groupId = `supplement-group:${lawId}`;
  const firstSupplement = supplementRoots[0];
  const rootIndex = new Map(supplementRoots.map((node, index) => [node.id, index + 1]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const findTopLevelRoot = (node: TocNode): TocNode => {
    let current = node;
    while (current.parentId) {
      const parent = nodeById.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const group: TocNode = {
    id: groupId,
    parentId: null,
    level: "supplement_group",
    title: `附則・経過措置（${supplementRoots.length}件）`,
    articleNumber: null,
    caption: null,
    sortOrder: firstSupplement.sortOrder,
    depth: 0,
    path: [...firstSupplement.path],
    textFirstLine: null,
    paragraphNumber: null,
  };

  const grouped = nodes.map((node) => {
    const root = findTopLevelRoot(node);
    const index = rootIndex.get(root.id);
    if (index === undefined) return node;
    const relativePath = node.path.slice(root.path.length);
    return {
      ...node,
      parentId: node.id === root.id ? groupId : node.parentId,
      depth: node.depth + 1,
      path: [firstSupplement.sortOrder, index, ...relativePath],
    };
  });

  return [...grouped, group].sort((left, right) => comparePath(left.path, right.path));
}
