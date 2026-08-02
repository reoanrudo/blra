"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TocNode } from "@/lib/article/toc-tree";
import { getAncestorIds, shouldExpandTocNodeByDefault } from "@/lib/article/toc-tree";
import { getCachedToc, setCachedToc, invalidateCachedToc } from "@/lib/article/toc-cache";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";

const TOC_LAST_REV_KEY = "toc-last-rev";

function getLastRevisionId(lawId: string): string | null {
  try {
    return sessionStorage.getItem(`${TOC_LAST_REV_KEY}:${lawId}`);
  } catch {
    return null;
  }
}

function saveLastRevisionId(lawId: string, revId: string): void {
  try {
    sessionStorage.setItem(`${TOC_LAST_REV_KEY}:${lawId}`, revId);
  } catch {
    // ignore
  }
}

interface UseTocTreeReturn {
  nodes: TocNode[];
  expandedIds: Set<string>;
  ancestorIds: Set<string>;
  toggle: (id: string) => void;
  loading: boolean;
  lawRevisionId: string | null;
}

function loadExpanded(lawId: string): Set<string> {
  try {
    const stored = sessionStorage.getItem(`toc-expanded-${lawId}`);
    if (stored) return new Set(JSON.parse(stored));
  } catch {
    // ignore
  }
  return new Set();
}

function saveExpanded(lawId: string, ids: Set<string>): void {
  try {
    sessionStorage.setItem(`toc-expanded-${lawId}`, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

// API応答型（設計書§4.2: lawRevisionId + editionKey + nodes）
interface TocApiResponse {
  lawRevisionId: string | null;
  editionKey: string;
  nodes: TocNode[];
}

export function useTocTree(lawId: string, currentArticleId: string | null): UseTocTreeReturn {
  const [nodes, setNodes] = useState<TocNode[]>([]);
  const [lawRevisionId, setLawRevisionId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => loadExpanded(lawId));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (!lawId) {
      setNodes([]);
      setLoading(false);
      return;
    }

    setExpandedIds(loadExpanded(lawId));

    // 設計書§4.2: 前回の lawRevisionId でキャッシュ確認。
    // ヒットすればAPIを呼ばずに再利用する（「通常は追加通信を発生させない」）。
    const lastRev = getLastRevisionId(lawId);
    if (lastRev) {
      const cached = getCachedToc(CURRENT_LAW_BOOK_EDITION_KEY, lastRev, lawId);
      if (cached) {
        setNodes(cached);
        setLawRevisionId(lastRev);
        setLoading(false);
        return; // API呼び出しなし
      }
    }

    // キャッシュmiss時のみAPI呼び出し
    fetch(`/api/law-toc?lawId=${encodeURIComponent(lawId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TocApiResponse | TocNode[] | null) => {
        // 後方互換: 配列（旧形式）かオブジェクト（新形式）か判定
        const isObject = data && !Array.isArray(data) && "nodes" in (data as TocApiResponse);
        const apiNodes = isObject
          ? (data as TocApiResponse).nodes
          : (data as TocNode[] | null) ?? [];
        const apiRev = isObject ? (data as TocApiResponse).lawRevisionId : null;

        setNodes(apiNodes);
        setLawRevisionId(apiRev);
        setLoading(false);

        // キャッシュへ保存（lawRevisionId確定後の正キー）
        if (apiRev && apiNodes.length > 0) {
          saveLastRevisionId(lawId, apiRev);
          setCachedToc(CURRENT_LAW_BOOK_EDITION_KEY, apiRev, lawId, apiNodes);
          // Revision変更検知: 前回と異なる場合は古いキャッシュを破棄
          if (lastRev && lastRev !== apiRev) {
            invalidateCachedToc(CURRENT_LAW_BOOK_EDITION_KEY, lastRev, lawId);
          }
        }
      })
      .catch(() => {
        setNodes([]);
        setLoading(false);
      });
  }, [lawId]);

  useEffect(() => {
    if (!currentArticleId || nodes.length === 0) return;

    const newAncestors = getAncestorIds(nodes, currentArticleId);
    if (newAncestors.size === 0) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      newAncestors.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (changed) saveExpanded(lawId, next);
      return next;
    });
  }, [currentArticleId, nodes, lawId]);

  useEffect(() => {
    if (nodes.length === 0) return;
    setExpandedIds((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const n of nodes) {
        if (shouldExpandTocNodeByDefault(n)) next.add(n.id);
      }
      if (next.size > 0) saveExpanded(lawId, next);
      return next;
    });
  }, [nodes, lawId]);

  const toggle = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        saveExpanded(lawId, next);
        return next;
      });
    },
    [lawId],
  );

  const ancestorIds = currentArticleId ? getAncestorIds(nodes, currentArticleId) : new Set<string>();

  return { nodes, expandedIds, ancestorIds, toggle, loading, lawRevisionId };
}
