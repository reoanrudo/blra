"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentLawId } from "@/contexts/CurrentLawContext";
import {
  getAncestorIds,
  shouldExpandTocNodeByDefault,
  type TocNode,
} from "@/lib/article/toc-tree";
import {
  chooseActiveLawId,
  lawSelectLabel,
  type LawListItem,
} from "@/lib/law-book/law-list";
import { loadLawList } from "@/lib/law-book/law-list-client";
import { readerArticleHref } from "@/lib/article/full-law-document";
import TocTree from "./TocTree";

interface TocPanelProps {
  nodes: TocNode[];
  currentArticleId: string | null;
  loading: boolean;
}

function expandedStorageKey(lawId: string | null): string {
  return `reader-toc-expanded:${lawId ?? "unknown"}`;
}

function loadExpanded(lawId: string | null): Set<string> {
  try {
    const raw = sessionStorage.getItem(expandedStorageKey(lawId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(lawId: string | null, ids: Set<string>): void {
  try {
    sessionStorage.setItem(
      expandedStorageKey(lawId),
      JSON.stringify([...ids]),
    );
  } catch {
    // 展開状態の保存失敗は閲覧を妨げない。
  }
}

export default function TocPanel({
  nodes,
  currentArticleId,
  loading,
}: TocPanelProps) {
  const router = useRouter();
  const lawSelectId = useId();
  const currentLawId = useCurrentLawId();
  const [laws, setLaws] = useState<LawListItem[]>([]);
  const [lawsLoading, setLawsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    loadLawList()
      .then((items) => {
        if (active) setLaws(items);
      })
      .catch(() => {
        if (active) setLaws([]);
      })
      .finally(() => {
        if (active) setLawsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const restored = loadExpanded(currentLawId);
    if (restored.size > 0) {
      setExpandedIds(restored);
      return;
    }
    const defaults = new Set(
      nodes
        .filter(shouldExpandTocNodeByDefault)
        .map((node) => node.id),
    );
    setExpandedIds(defaults);
  }, [currentLawId, nodes]);

  useEffect(() => {
    if (!currentArticleId || nodes.length === 0) return;
    const ancestors = getAncestorIds(nodes, currentArticleId);
    if (ancestors.size === 0) return;
    setExpandedIds((current) => {
      const next = new Set(current);
      ancestors.forEach((id) => next.add(id));
      saveExpanded(currentLawId, next);
      return next;
    });
  }, [currentArticleId, currentLawId, nodes]);

  const ancestorIds = useMemo(
    () =>
      currentArticleId
        ? getAncestorIds(nodes, currentArticleId)
        : new Set<string>(),
    [currentArticleId, nodes],
  );
  const activeLawId = chooseActiveLawId(laws, currentLawId);

  const toggle = useCallback(
    (id: string) => {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        saveExpanded(currentLawId, next);
        return next;
      });
    },
    [currentLawId],
  );

  return (
    <div className="flex h-full flex-col">
      {lawsLoading && (
        <div className="shrink-0 border-b border-neutral-200 p-2">
          <div className="h-8 animate-pulse rounded bg-neutral-200" />
        </div>
      )}

      {!lawsLoading && laws.length > 1 && (
        <div className="shrink-0 border-b border-neutral-300 bg-white px-2 py-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-neutral-500">
            <label htmlFor={lawSelectId}>収録法令</label>
            <span>{laws.length}件</span>
          </div>
          <select
            id={lawSelectId}
            value={activeLawId ?? ""}
            onChange={(event) => {
              const selected = laws.find(
                (law) => law.id === event.target.value,
              );
              if (selected) router.push(readerArticleHref(selected.firstArticleId));
            }}
            className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800 focus:border-[#d92f7e] focus:outline-none focus:ring-1 focus:ring-[#d92f7e]"
          >
            {laws.map((law) => (
              <option key={law.id} value={law.id}>
                {lawSelectLabel(law)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3" aria-label="目次を読み込み中">
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
            <div className="ml-3 h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
            <div className="ml-3 h-4 w-2/3 animate-pulse rounded bg-neutral-200" />
          </div>
        ) : (
          <TocTree
            nodes={nodes}
            expandedIds={expandedIds}
            onToggle={toggle}
            currentArticleId={currentArticleId}
            ancestorIds={ancestorIds}
          />
        )}
      </div>
    </div>
  );
}
