"use client";

import { memo } from "react";
import { isExpandableTocLevel, nodeLabel } from "@/lib/article/toc-tree";
import type { TocNode } from "@/lib/article/toc-tree";

interface TocTreeNodeProps {
  node: TocNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
  isCurrent: boolean;
  isAncestor: boolean;
  showCategoryBoundary: boolean;
}

function TocTreeNodeImpl({
  node,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onClick,
  isCurrent,
  isAncestor,
  showCategoryBoundary,
}: TocTreeNodeProps) {
  const isHeading = isExpandableTocLevel(node.level);

  function handleClick() {
    if (isHeading) {
      onToggle(node.id);
    } else {
      onClick(node.id);
    }
  }

  return (
    <>
      {showCategoryBoundary && (
        <div className="border-t border-neutral-300 my-1" />
      )}
      <button
        type="button"
        data-article-id={node.id}
        aria-current={isCurrent ? "location" : undefined}
        onClick={handleClick}
        className={`w-full flex items-center gap-1 px-2 py-1 text-left text-xs transition-colors ${
          isCurrent
            ? "bg-[#fff4f9] border-l-2 border-[#d92f7e] font-semibold text-[#9d1f58]"
            : isAncestor
              ? "bg-[#faf8f4] text-neutral-800"
              : "text-neutral-700 hover:bg-white"
        }`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        {hasChildren && (
          <span className="w-3 flex-shrink-0 text-neutral-400 text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        )}
        {!hasChildren && <span className="w-3 flex-shrink-0" />}

        {node.level === "appdx_table" && <span className="flex-shrink-0">📎</span>}
        {["supplement_group", "suppl_provision"].includes(node.level) && <span className="flex-shrink-0">📌</span>}

        <span className="truncate">{nodeLabel(node)}</span>
      </button>
    </>
  );
}

const TocTreeNode = memo(TocTreeNodeImpl);
export default TocTreeNode;
