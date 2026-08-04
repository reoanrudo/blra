"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TocNode } from "@/lib/article/toc-tree";
import { isExpandableTocLevel, nodeCategory } from "@/lib/article/toc-tree";
import {
  fullLawTargetSelector,
  readerArticleHref,
} from "@/lib/article/full-law-document";
import { useScrollActiveArticle } from "@/contexts/ScrollActiveArticleContext";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";
import TocTreeNode from "./TocTreeNode";

/** クリックジャンプ時の上部オフセット（固定ヘッダ回避・scroll-mt-20 に相当） */
const SCROLL_OFFSET_PX = 80;

/** 通常状態の className（isCurrent/isAncestor でないノード） */
const TOC_NODE_CLASS_NORMAL =
  "w-full flex items-center gap-1 px-2 py-1 text-left text-xs text-neutral-700";
/** アクティブ（current）状態の className */
const TOC_NODE_CLASS_CURRENT =
  "w-full flex items-center gap-1 px-2 py-1 text-left text-xs bg-[#fff4f9] border-l-2 border-[#d92f7e] font-semibold text-[#9d1f58]";

/**
 * DOM直接操作で目次ハイライトを瞬時に切り替える。
 * React再描画を待たずに className と aria-current を書き換える。
 */
function applyHighlightDirect(
  container: HTMLDivElement | null,
  newArticleId: string,
): void {
  if (!container) return;

  // 旧アクティブ要素のハイライトを解除
  const prevActive = container.querySelector<HTMLElement>(
    'button[aria-current="location"]',
  );
  if (prevActive) {
    prevActive.className = TOC_NODE_CLASS_NORMAL;
    prevActive.removeAttribute("aria-current");
  }

  // 新アクティブ要素にハイライトを付与
  const escaped = CSS.escape(newArticleId);
  const nextActive = container.querySelector<HTMLElement>(
    `button[data-article-id="${escaped}"]`,
  );
  if (nextActive) {
    nextActive.className = TOC_NODE_CLASS_CURRENT;
    nextActive.setAttribute("aria-current", "location");
  }
}

interface TocTreeProps {
  nodes: TocNode[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  currentArticleId: string | null;
  ancestorIds: Set<string>;
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
}: TocTreeProps) {
  const router = useRouter();
  const scrollState = useScrollActiveArticle();
  const scrollContainerRef = useScrollContainer();
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

  // 表示ノード一覧の長さだけ追従（内容の同一性はvisibleNodesのmemoに任せる）
  const visibleCount = visibleNodes.length;

  useEffect(() => {
    if (!currentArticleId || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-article-id="${CSS.escape(currentArticleId)}"]`,
    );
    if (el) {
      (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentArticleId, visibleCount]);

  const handleArticleClick = useCallback(
    (articleId: string) => {
      // ターゲット要素を特定。ID セレクタ優先、フォールバックは data-article-id。
      const target =
        document.querySelector<HTMLElement>(fullLawTargetSelector(articleId)) ??
        document.querySelector<HTMLElement>(
          `[data-scroll-article-id="${CSS.escape(articleId)}"]`,
        );

      if (target) {
        // ── 本文ジャンプ（純粋なDOM操作・瞬時） ──
        // クリック後の scrollTop 変更で発火する scroll イベントによる
        // ハイライト再計算を1フレーム分スキップ（競合回避）
        scrollState?.suppressScrollSyncOneFrame();

        const scroller =
          scrollContainerRef?.current ??
          document.querySelector<HTMLElement>('[data-scroll-container]');

        if (scroller) {
          const scrollerRect = scroller.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const delta = targetRect.top - scrollerRect.top - SCROLL_OFFSET_PX;
          if (delta !== 0) {
            scroller.scrollTop += delta;
          }
        } else {
          target.scrollIntoView({ block: "start" });
        }

        // URL更新（瞬時）
        window.history.replaceState(
          window.history.state,
          "",
          readerArticleHref(articleId),
        );

        // ── 目次ハイライト切替（純粋なDOM操作・瞬時） ──
        // React再描画を待たずにDOM直接操作でハイライトを切り替える。
        applyHighlightDirect(containerRef.current, articleId);

        // ── React State更新は次フレームに遅延 ──
        // scrollTop 変更の scroll イベントは suppressScrollSyncOneFrame で
        // スキップ済みなので競合しない。右パネル等の同期はここで行われる。
        requestAnimationFrame(() => {
          scrollState?.activateArticle(articleId);
        });
        return;
      }

      // ターゲットがDOMにない（未描画の条文）→ルーター遷移
      router.push(readerArticleHref(articleId));
    },
    [router, scrollState, scrollContainerRef],
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
            onToggle={onToggle}
            onClick={handleArticleClick}
            isCurrent={node.id === currentArticleId}
            isAncestor={ancestorIds.has(node.id)}
            showCategoryBoundary={showBoundary}
          />
        );
      })}
    </div>
  );
}
