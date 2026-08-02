"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useApplicability } from "@/contexts/ApplicabilityContext";

export interface AnnotationData {
  id: string;
  articleId: string;
  tag: "applicable" | "review" | "reference";
  note: string | null;
}

interface AnnotationState {
  annotations: Map<string, AnnotationData>;
  activeArticleId: string | null;
}

interface AnnotationContextValue {
  state: AnnotationState;
  upsertAnnotation: (
    articleId: string,
    tag: string,
    note?: string,
  ) => Promise<void>;
  deleteAnnotation: (id: string, articleId: string) => Promise<void>;
  openEditor: (articleId: string) => void;
  closeEditor: () => void;
}

const AnnotationCtx = createContext<AnnotationContextValue | null>(null);

export function AnnotationProvider({
  children,
  initialAnnotations,
}: {
  children: ReactNode;
  initialAnnotations: AnnotationData[];
}) {
  const applicability = useApplicability();
  const [annotations, setAnnotations] = useState(() => {
    const map = new Map<string, AnnotationData>();
    for (const a of initialAnnotations) {
      map.set(a.articleId, a);
    }
    return map;
  });
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const upsertAnnotation = useCallback(
    async (articleId: string, tag: string, note?: string) => {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          tag,
          note,
          ...applicability.snapshot,
        }),
      });
      if (!res.ok) throw new Error("Failed to save annotation");
      const data: AnnotationData = await res.json();
      setAnnotations((prev) => {
        const next = new Map(prev);
        next.set(articleId, data);
        return next;
      });
    },
    [applicability.snapshot],
  );

  const deleteAnnotation = useCallback(
    async (id: string, articleId: string) => {
      const res = await fetch(`/api/annotations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete annotation");
      setAnnotations((prev) => {
        const next = new Map(prev);
        next.delete(articleId);
        return next;
      });
    },
    [],
  );

  const openEditor = useCallback((articleId: string) => {
    setActiveArticleId(articleId);
  }, []);

  const closeEditor = useCallback(() => {
    setActiveArticleId(null);
  }, []);

  return (
    <AnnotationCtx.Provider
      value={{
        state: { annotations, activeArticleId },
        upsertAnnotation,
        deleteAnnotation,
        openEditor,
        closeEditor,
      }}
    >
      {children}
    </AnnotationCtx.Provider>
  );
}

export function useAnnotation(): AnnotationContextValue {
  const ctx = useContext(AnnotationCtx);
  if (!ctx) {
    throw new Error("useAnnotation must be used within AnnotationProvider");
  }
  return ctx;
}
