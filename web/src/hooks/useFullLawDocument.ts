"use client";

import { useCallback, useEffect, useState } from "react";
import type { FullLawDocument } from "@/lib/article/full-law-document";
import {
  clearFullLawDocumentCache,
  fetchFullLawDocument,
} from "@/lib/article/full-law-client";

type FullLawDocumentState = {
  status: "loading" | "ready" | "error";
  document: FullLawDocument | null;
};

export function useFullLawDocument(revisionId: string): FullLawDocumentState & {
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FullLawDocumentState>({
    status: "loading",
    document: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", document: null });

    fetchFullLawDocument(revisionId)
      .then((document) => {
        if (active) setState({ status: "ready", document });
      })
      .catch(() => {
        if (active) setState({ status: "error", document: null });
      });

    return () => {
      active = false;
    };
  }, [attempt, revisionId]);

  const retry = useCallback(() => {
    clearFullLawDocumentCache(revisionId);
    setAttempt((current) => current + 1);
  }, [revisionId]);

  return { ...state, retry };
}
