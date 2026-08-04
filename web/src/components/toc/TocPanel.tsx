"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentLawId } from "@/contexts/CurrentLawContext";
import {
  getAncestorIdsWithMap,
  shouldExpandTocNodeByDefault,
  type TocNode,
} from "@/lib/article/toc-tree";
import {
  chooseActiveLawId,
  lawSelectLabel,
  type LawListItem,
} from "@/lib/law-book/law-list";
import { CURRENT_LAW_BOOK_EDITION_KEY } from "@/lib/law-book/current-edition";
import { readerArticleHref } from "@/lib/article/full-law-document";
import TocTree from "./TocTree";

interface TocPanelProps {
  nodes: TocNode[];
  currentArticleId: string | null;
  loading: boolean;
}

const EMPTY_SET = new Set<string>();

interface LawListResponse {
  editionKey: string;
  laws: LawListItem[];
}

const lawListMemoryCache = new Map<string, LawListItem[]>();
const lawListRequestCache = new Map<string, Promise<LawListItem[]>>();
const LAW_LIST_SESSION_KEY = "law-list-cache";

function loadLawListFromSession(): LawListItem[] | null {
  try {
    const raw = sessionStorage.getItem(LAW_LIST_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LawListResponse;
    if (
      parsed.editionKey === CURRENT_LAW_BOOK_EDITION_KEY &&
      Array.isArray(parsed.laws) &&
      parsed.laws.length > 0
    ) {
      return parsed.laws;
    }
  } catch {
    // 保存データを利用できない場合はAPIから読み直す。
  }
  return null;
}

function saveLawListToSession(laws: LawListItem[]): void {
  if (laws.length === 0) return;
  try {
    sessionStorage.setItem(
      LAW_LIST_SESSION_KEY,
      JSON.stringify({ editionKey: CURRENT_LAW_BOOK_EDITION_KEY, laws }),
    );
  } catch {
    // private modeなどではメモリキャッシュだけを使う。
  }
}

function loadLawList(): Promise<LawListItem[]> {
  const memory = lawListMemoryCache.get(CURRENT_LAW_BOOK_EDITION_KEY);
  if (memory) return Promise.resolve(memory);

  const session = loadLawListFromSession();
  if (session) {
    lawListMemoryCache.set(CURRENT_LAW_BOOK_EDITION_KEY, session);
    return Promise.resolve(session);
  }

  const pending = lawListRequestCache.get(CURRENT_LAW_BOOK_EDITION_KEY);
  if (pending) return pending;

  const request = fetch("/api/laws")
    .then(async (response) => {
      if (!response.ok) throw new Error("法令一覧を取得できませんでした");
      const data = (await response.json()) as LawListResponse | LawListItem[];
      const laws = Array.isArray(data) ? data : data.laws;
      lawListMemoryCache.set(CURRENT_LAW_BOOK_EDITION_KEY, laws);
      saveLawListToSession(laws);
      return laws;
    })
    .finally(() => {
      lawListRequestCache.delete(CURRENT_LAW_BOOK_EDITION_KEY);
    });
  lawListRequestCache.set(CURRENT_LAW_BOOK_EDITION_KEY, request);
  return request;
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

  // nodeMap をキャッシュ。nodes が変わらない限り再利用する。
  // getAncestorIds が毎回725ノードのMapを構築するのを防ぐ。
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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
    if (!currentArticleId || nodeMap.size === 0) return;
    const ancestors = getAncestorIdsWithMap(nodeMap, currentArticleId);
    if (ancestors.size === 0) return;
    setExpandedIds((current) => {
      let changed = false;
      ancestors.forEach((id) => {
        if (!current.has(id)) {
          changed = true;
        }
      });
      if (!changed) return current;
      const next = new Set(current);
      ancestors.forEach((id) => next.add(id));
      saveExpanded(currentLawId, next);
      return next;
    });
  }, [currentArticleId, currentLawId, nodeMap]);

  const ancestorIds = useMemo(
    () =>
      currentArticleId
        ? getAncestorIdsWithMap(nodeMap, currentArticleId)
        : EMPTY_SET,
    [currentArticleId, nodeMap],
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
