"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { fetchHighlightsBatch } from "@/lib/highlight/user-highlight-batch";

export interface UserHighlightData {
  id: string;
  articleId: string;
  rangeStart: number;
  rangeEnd: number;
  color: string;
  type: string;
}

interface UserHighlightContextValue {
  highlights: Map<string, UserHighlightData[]>;
  loading: boolean;
  refresh: (articleIds: string[]) => Promise<void>;
  addHighlight: (h: UserHighlightData) => void;
  removeHighlight: (id: string, articleId: string) => void;
}

const UserHighlightContext = createContext<UserHighlightContextValue | null>(
  null,
);

export function useUserHighlights(): UserHighlightContextValue | null {
  return useContext(UserHighlightContext);
}

interface ProviderProps {
  children: ReactNode;
  /** Article IDs to load highlights for on mount */
  initialArticleIds?: string[];
}

export function UserHighlightProvider({
  children,
  initialArticleIds,
}: ProviderProps) {
  const [highlights, setHighlights] = useState<Map<string, UserHighlightData[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (articleIds: string[]) => {
    if (articleIds.length === 0) return;
    setLoading(true);
    try {
      // 一括取得APIで1リクエスト化（従来の個別fetchを廃止・設計書§4.3, §5）
      const result = await fetchHighlightsBatch(articleIds);
      setHighlights((prev) => {
        const next = new Map(prev);
        for (const [id, list] of result.entries()) {
          next.set(id, list);
        }
        // articleIdsのうち結果に含まれないものは空配列をセット（未ハイライト明示）
        for (const id of articleIds) {
          if (!next.has(id)) next.set(id, []);
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const addHighlight = useCallback((h: UserHighlightData) => {
    setHighlights((prev) => {
      const next = new Map(prev);
      const list = next.get(h.articleId) ?? [];
      next.set(h.articleId, [...list, h]);
      return next;
    });
  }, []);

  const removeHighlight = useCallback((id: string, articleId: string) => {
    setHighlights((prev) => {
      const next = new Map(prev);
      const list = next.get(articleId);
      if (list) {
        next.set(
          articleId,
          list.filter((h) => h.id !== id),
        );
      }
      return next;
    });
  }, []);

  // Load highlights on mount if initialArticleIds provided
  useEffect(() => {
    if (!initialArticleIds || initialArticleIds.length === 0) return;
    const toFetch = initialArticleIds.filter(
      (id) => !fetchedRef.current.has(id),
    );
    if (toFetch.length === 0) return;

    for (const id of toFetch) {
      fetchedRef.current.add(id);
    }

    refresh(toFetch);
  }, [initialArticleIds, refresh]);

  // Listen for highlight-created events from ContextMenuProvider (cross-context bridge)
  useEffect(() => {
    function handleHighlightCreated(e: Event) {
      const detail = (e as CustomEvent<UserHighlightData>).detail;
      if (detail) {
        addHighlight(detail);
      }
    }
    window.addEventListener("user-highlight-created", handleHighlightCreated);
    return () =>
      window.removeEventListener("user-highlight-created", handleHighlightCreated);
  }, [addHighlight]);

  // Listen for highlight-deleted events from ContextMenuProvider
  useEffect(() => {
    function handleHighlightDeleted(e: Event) {
      const detail = (e as CustomEvent<{ id: string; articleId: string }>).detail;
      if (detail) {
        removeHighlight(detail.id, detail.articleId);
      }
    }
    window.addEventListener("user-highlight-deleted", handleHighlightDeleted);
    return () =>
      window.removeEventListener("user-highlight-deleted", handleHighlightDeleted);
  }, [removeHighlight]);

  return (
    <UserHighlightContext.Provider
      value={{ highlights, loading, refresh, addHighlight, removeHighlight }}
    >
      {children}
    </UserHighlightContext.Provider>
  );
}
