"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConfirmedRelationsDocument } from "@/lib/relations/confirmed-relation";
import {
  clearConfirmedRelationsCache,
  fetchConfirmedRelations,
} from "@/lib/relations/confirmed-relations-client";

export type ConfirmedRelationsState = {
  status: "loading" | "ready" | "error";
  document: ConfirmedRelationsDocument | null;
  retry: () => void;
};

export function useConfirmedRelations(
  revisionId: string,
): ConfirmedRelationsState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<ConfirmedRelationsState, "retry">>({
    status: "loading",
    document: null,
  });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", document: null });
    fetchConfirmedRelations(revisionId)
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
    clearConfirmedRelationsCache(revisionId);
    setAttempt((current) => current + 1);
  }, [revisionId]);

  return { ...state, retry };
}
