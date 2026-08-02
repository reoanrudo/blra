"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface Suggestion {
  kind: "history" | "caption" | "articleNumber";
  label: string;
  articleId?: string;
}

interface QuickSearchProps {
  projectId: string;
  onAdd: () => void;
}

export default function QuickSearch({ projectId, onAdd }: QuickSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search/suggest?q=${encodeURIComponent(q)}&projectId=${encodeURIComponent(projectId)}`,
      );
      if (res.ok) {
        const json = await res.json();
        const items = (json.suggestions ?? []) as Suggestion[];
        setSuggestions(items);
        setShowDropdown(items.length > 0);
      } else {
        setSuggestions([]);
        setShowDropdown(false);
      }
    } catch {
      setSuggestions([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 200);
  }

  async function handleSelectSuggestion(suggestion: Suggestion) {
    if (!suggestion.articleId) return;

    setAdding(true);
    setShowDropdown(false);

    try {
      const res = await fetch("/api/checkitems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          articleId: suggestion.articleId,
          title: suggestion.label,
        }),
      });

      if (res.ok) {
        setQuery("");
        setSuggestions([]);
        setMessage("確認項目を追加しました");
        onAdd();
      } else {
        setMessage("追加に失敗しました");
      }
    } catch {
      setMessage("追加に失敗しました");
    } finally {
      setAdding(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const kindLabel: Record<string, string> = {
    history: "履歴",
    caption: "見出し",
    articleNumber: "条文番号",
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            placeholder="条文を検索して追加..."
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          {loading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}-${s.label}-${i}`}
              type="button"
              disabled={adding || !s.articleId}
              onClick={() => handleSelectSuggestion(s)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-blue-50 disabled:opacity-50"
            >
              <span
                className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-medium ${
                  s.kind === "caption"
                    ? "bg-green-100 text-green-700"
                    : s.kind === "articleNumber"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {kindLabel[s.kind] ?? s.kind}
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Status message */}
      {message && (
        <p
          className={`mt-1 text-[10px] ${
            message.includes("失敗") ? "text-red-500" : "text-green-600"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
