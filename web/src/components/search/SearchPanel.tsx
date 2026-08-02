"use client";

import { useState, useEffect, useRef } from "react";

export interface SearchResult {
  id: string;
  articleNumberNormalized: string | null;
  caption: string | null;
  textSnippet: string;
  lawName: string;
  lawShortName: string | null;
  matchSource: "caption" | "text";
}

interface SearchPanelProps {
  onSearchStateChange?: (state: {
    query: string;
    results: SearchResult[];
    loading: boolean;
  }) => void;
}

const HISTORY_KEY = "hourei-search-history";
const MAX_HISTORY = 20;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistoryItem(query: string): string[] {
  try {
    const history = loadHistory();
    const deduped = [query, ...history.filter((h) => h !== query)].slice(
      0,
      MAX_HISTORY,
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(deduped));
    return deduped;
  } catch {
    return [];
  }
}

export default function SearchPanel({ onSearchStateChange }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const callbackRef = useRef(onSearchStateChange);
  callbackRef.current = onSearchStateChange;

  // Load localStorage history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Debounced search fetch
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLoading(false);
      callbackRef.current?.({ query: "", results: [], loading: false });
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      callbackRef.current?.({ query: trimmed, results: [], loading: true });

      const params = new URLSearchParams({ q: trimmed });

      fetch(`/api/search?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          const results = data.results ?? [];
          const updated = saveHistoryItem(trimmed);
          setHistory(updated);
          callbackRef.current?.({
            query: trimmed,
            results,
            loading: false,
          });
        })
        .catch(() => {
          callbackRef.current?.({
            query: trimmed,
            results: [],
            loading: false,
          });
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const updated = saveHistoryItem(trimmed);
    setHistory(updated);
    setShowHistory(false);

    inputRef.current?.blur();
  }

  function onFocus() {
    if (!query) {
      setHistory(loadHistory());
      setShowHistory(true);
    }
  }

  function onBlur() {
    setTimeout(() => setShowHistory(false), 150);
  }

  function onHistoryClick(term: string) {
    setQuery(term);
    setShowHistory(false);
  }

  return (
    <div className="relative">
      <form onSubmit={onSubmit}>
        <div className="flex items-center border border-neutral-300 bg-white focus-within:border-[#d92f7e] focus-within:ring-1 focus-within:ring-[#f4b7d2]">
          <svg
            className="ml-2 h-4 w-4 flex-shrink-0 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="条文を検索..."
            className="flex-1 bg-transparent px-2 py-1.5 text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
          />
          {loading && (
            <div className="mr-2 h-3 w-3 animate-spin rounded-full border border-[#d92f7e] border-t-transparent" />
          )}
        </div>
      </form>

      {/* Search history dropdown */}
      {showHistory && history.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 border border-neutral-300 bg-white shadow-lg">
          <p className="border-b border-neutral-200 px-3 py-1.5 text-xs text-neutral-500">
            最近の検索
          </p>
          <ul>
            {history.map((term, i) => (
              <li key={`${term}-${i}`}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-[#fff4f9] hover:text-[#9d1f58]"
                  onMouseDown={() => onHistoryClick(term)}
                >
                  {term}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
