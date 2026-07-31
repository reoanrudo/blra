
import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "../../lib/navigation-stub";
import type { TocNode } from "@/lib/article/toc-tree";
import { isExpandableTocLevel, nodeCategory } from "@/lib/article/toc-tree";
import { setPendingTocScroll } from "@/lib/article/toc-scroll";
import TocTreeNode from "./TocTreeNode";

interface TocTreeProps {
  nodes: TocNode[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  currentArticleId: string | null;
  ancestorIds: Set<string>;
  /** 条クリック時のコールバック（blra 用: router ではなく直接本文スクロール） */
  onArticleClick?: (node: TocNode) => void;
}

function computeVisibleNodes(nodes: TocNode[], expandedIds: Set<string>): TocNode[] {
  const visibleSet = new Set<string>();
  const parentExpanded = new Set<string>();

  return nodes.filter((node) => {
    if (node.depth === 0) {
      visibleSet.add(node.id);
      if (expandedIds.has(node.id)) parentExpanded.add(node.id);
      return true;
    }

    const isParentExpanded = node.parentId ? parentExpanded.has(node.parentId) : false;

    if (isParentExpanded) {
      visibleSet.add(node.id);
      if (expandedIds.has(node.id)) parentExpanded.add(node.id);
      return true;
    }

    return false;
  });
}

export default function TocTree({
  nodes,
  expandedIds,
  onToggle,
  currentArticleId,
  ancestorIds,
  onArticleClick,
}: TocTreeProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const childrenSet = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.parentId) set.add(n.parentId);
    }
    return set;
  }, [nodes]);

  const visibleNodes = useMemo(
    () => computeVisibleNodes(nodes, expandedIds),
    [nodes, expandedIds],
  );

  useEffect(() => {
    if (!currentArticleId || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-article-id="${CSS.escape(currentArticleId)}"]`,
    );
    if (el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [currentArticleId, visibleNodes]);

  const handleArticleClick = useCallback(
    (articleId: string) => {
      // blra 用: callback があれば router.push の代わりに使用
      if (onArticleClick) {
        const node = nodes.find((n) => n.id === articleId);
        if (node) { onArticleClick(node); return; }
      }
      // フォールバック: 本文スクロール
      const el = document.querySelector<HTMLElement>(
        `[data-scroll-article-id="${CSS.escape(articleId)}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      // 別章: スクロール先を記録して遷移
      setPendingTocScroll(articleId);
      router.push(`/articles/${articleId}`);
    },
    [router, onArticleClick, nodes],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visibleNodes.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
        case "j": {
          e.preventDefault();
          setFocusIndex((prev) => (prev < visibleNodes.length - 1 ? prev + 1 : 0));
          break;
        }
        case "ArrowUp":
        case "k": {
          e.preventDefault();
          setFocusIndex((prev) => (prev > 0 ? prev - 1 : visibleNodes.length - 1));
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < visibleNodes.length) {
            const n = visibleNodes[focusIndex];
            if (isExpandableTocLevel(n.level)) {
              onToggle(n.id);
            } else {
              handleArticleClick(n.id);
            }
          }
          break;
        }
        case " ": {
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < visibleNodes.length) {
            onToggle(visibleNodes[focusIndex].id);
          }
          break;
        }
      }
    },
    [visibleNodes, focusIndex, onToggle, handleArticleClick],
  );

  if (visibleNodes.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-xs text-neutral-500">該当する項目がありません</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="tree"
      className="outline-none focus:ring-1 focus:ring-[#d92f7e]"
      onKeyDown={handleKeyDown}
    >
      {visibleNodes.map((node, index) => {
        const prevNode = index > 0 ? visibleNodes[index - 1] : null;
        const showBoundary = prevNode
          ? nodeCategory(prevNode.level) !== nodeCategory(node.level)
          : false;

        return (
          <TocTreeNode
            key={node.id}
            node={node}
            depth={node.depth}
            expanded={expandedIds.has(node.id)}
            hasChildren={childrenSet.has(node.id)}
            onToggle={() => onToggle(node.id)}
            onClick={() => handleArticleClick(node.id)}
            isCurrent={node.id === currentArticleId}
            isAncestor={ancestorIds.has(node.id)}
            showCategoryBoundary={showBoundary}
          />
        );
      })}
    </div>
  );
}
