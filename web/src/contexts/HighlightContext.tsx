"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { HighlightResponse } from "@/lib/highlight/highlight";
import {
  getCachedHighlight,
  setCachedHighlight,
  clearHighlightCache,
} from "@/lib/highlight/highlight-cache";

// ── Types ──

interface Conditions {
  useDistrict?: string;
  fireDistrict?: string;
  buildingUse?: string;
  structureType?: string;
  floors?: number;
  height?: number;
  totalFloorArea?: number;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  specialUses?: string[];
}

interface HighlightInfo {
  articleId: string;
  conditionTypes: string[];
  conditionValues: string[];
  highlightLevel: string;
}

interface HighlightState {
  enabled: boolean;
  conditions: Conditions | null;
  highlights: Map<string, HighlightInfo>;
  loading: boolean;
  error: string | null;
}

type HighlightAction =
  | { type: "TOGGLE"; enabled: boolean }
  | { type: "SET_CONDITIONS"; conditions: Conditions }
  | { type: "SET_HIGHLIGHTS"; highlights: HighlightInfo[] }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string };

// ── Reducer ──

function highlightReducer(
  state: HighlightState,
  action: HighlightAction,
): HighlightState {
  switch (action.type) {
    case "TOGGLE":
      return { ...state, enabled: action.enabled };
    case "SET_CONDITIONS":
      return { ...state, conditions: action.conditions };
    case "SET_HIGHLIGHTS": {
      const map = new Map<string, HighlightInfo>();
      for (const h of action.highlights) {
        map.set(h.articleId, h);
      }
      return { ...state, highlights: map, loading: false };
    }
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    default:
      return state;
  }
}

// ── Context ──

interface HighlightContextValue {
  state: HighlightState;
  toggle: (enabled: boolean) => void;
  setConditions: (conditions: Conditions) => void;
  fetchHighlights: (conditions: Conditions) => Promise<void>;
}

const HighlightContext = createContext<HighlightContextValue | null>(null);

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(highlightReducer, {
    enabled: false,
    conditions: null,
    highlights: new Map(),
    loading: false,
    error: null,
  });

  const toggle = useCallback((enabled: boolean) => {
    dispatch({ type: "TOGGLE", enabled });
  }, []);

  const setConditions = useCallback((conditions: Conditions) => {
    dispatch({ type: "SET_CONDITIONS", conditions });
  }, []);

  const fetchHighlights = useCallback(
    async (conditions: Conditions) => {
      dispatch({ type: "SET_LOADING", loading: true });

      const cached = getCachedHighlight(conditions as Record<string, unknown>);
      if (cached) {
        dispatch({ type: "SET_HIGHLIGHTS", highlights: cached.highlights });
        return;
      }

      try {
        const res = await fetch("/api/highlight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conditions }),
        });

        if (!res.ok) {
          throw new Error(`Highlight API error: ${res.status}`);
        }

        const data: HighlightResponse = await res.json();
        setCachedHighlight(
          conditions as Record<string, unknown>,
          data,
        );
        dispatch({ type: "SET_HIGHLIGHTS", highlights: data.highlights });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        dispatch({ type: "SET_ERROR", error: message });
      }
    },
    [],
  );

  // conditions が変更されたらキャッシュクリアして再取得
  useEffect(() => {
    if (state.enabled && state.conditions) {
      clearHighlightCache();
      fetchHighlights(state.conditions);
    }
  }, [state.conditions]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HighlightContext.Provider
      value={{ state, toggle, setConditions, fetchHighlights }}
    >
      {children}
    </HighlightContext.Provider>
  );
}

export function useHighlight(): HighlightContextValue {
  const ctx = useContext(HighlightContext);
  if (!ctx) {
    throw new Error("useHighlight must be used within HighlightProvider");
  }
  return ctx;
}
