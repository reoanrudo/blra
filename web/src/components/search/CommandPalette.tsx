"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/practice/project-context";
import { registerCmdPaletteToggle } from "@/lib/system/keybindings";
import { buildArticleHrefFromSearchParams } from "@/lib/applicability/applicability-context";

interface Suggestion {
  kind: "history" | "caption" | "articleNumber" | "project" | "articleJump";
  label: string;
  articleId?: string;
  projectId?: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const { activeProjectId, setActiveProjectId } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Register Cmd+K toggle with global keybinding handler
  useEffect(() => {
    registerCmdPaletteToggle(() => setOpen((prev) => !prev));
    return () => registerCmdPaletteToggle(() => {});
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSuggestions([]);
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced suggest fetch
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [suggestRes, projectsRes] = await Promise.all([
        fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`),
        fetch("/api/projects"),
      ]);
      const data = suggestRes.ok ? await suggestRes.json() : { suggestions: [] };
      const projects: { id: string; name: string }[] = projectsRes.ok
        ? await projectsRes.json()
        : [];

      const suggestions: Suggestion[] = [];

      // ">" prefix — project-only filter mode
      if (q.startsWith(">")) {
        const searchTerm = q.slice(1).trim().toLowerCase();
        const filtered = searchTerm
          ? projects.filter((p) => p.name.toLowerCase().includes(searchTerm))
          : projects;
        setSuggestions(
          filtered.map((p) => ({
            kind: "project" as const,
            label: p.name,
            projectId: p.id,
          })).slice(0, 10),
        );
        setSelectedIndex(-1);
        setLoading(false);
        return;
      }

      // Start with suggest API results
      suggestions.push(...(data.suggestions ?? []));

      // Article number pattern detection — 法第87条, 第87条, 87条, 令第128条の3
      const articlePattern = /^(法|令)?第?(\d+(?:の\d+)*)条?$/;
      const articleMatch = q.match(articlePattern);
      if (articleMatch) {
        const prefix = articleMatch[1] ?? null;
        const num = articleMatch[2];
        try {
          const params = new URLSearchParams({ q: num });
          if (prefix) params.set("prefix", prefix);
          const jumpRes = await fetch(
            `/api/articles/by-number?${params.toString()}`,
          );
          const jumpData = await jumpRes.json();
          const jumpArticles: {
            id: string;
            articleNumber: string | null;
            caption: string | null;
            lawName: string;
            lawShortName: string | null;
          }[] = jumpData.articles ?? [];
          for (const a of jumpArticles) {
            const label = `${a.lawShortName ?? a.lawName} 第${a.articleNumber}条${a.caption ? `  ${a.caption}` : ""}`;
            suggestions.unshift({
              kind: "articleJump",
              label,
              articleId: a.id,
            });
          }
        } catch { /* ignore */ }
      }

      // Add matching projects
      const lowerQ = q.toLowerCase();
      for (const p of projects) {
        if (p.name.toLowerCase().includes(lowerQ)) {
          suggestions.push({
            kind: "project",
            label: p.name,
            projectId: p.id,
          });
        }
      }

      setSuggestions(suggestions.slice(0, 10));
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 150);
  }

  function navigate(item: Suggestion) {
    setOpen(false);
    if (item.kind === "project" && item.projectId) {
      setActiveProjectId(item.projectId);
      router.push(`/projects/${item.projectId}`);
      return;
    }
    if (item.articleId) {
      router.push(
        buildArticleHrefFromSearchParams(
          item.articleId,
          new URLSearchParams(window.location.search),
        ),
      );
    } else if (item.kind === "history") {
      router.push(`/search?q=${encodeURIComponent(item.label)}`);
    }
  }

  function submitFullSearch() {
    if (!query.trim()) return;
    setOpen(false);
    // If a suggestion is selected, navigate to it
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      navigate(suggestions[selectedIndex]);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submitFullSearch();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
          {/* Input */}
          <div className="flex items-center border-b border-gray-200 px-4">
            <svg
              className="w-5 h-5 text-gray-400 flex-shrink-0"
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
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="条文番号またはキーワードを入力"
              className="flex-1 px-3 py-4 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {/* Results */}
          {suggestions.length > 0 && (
            <ul className="max-h-72 overflow-y-auto py-2">
              {suggestions.map((item, i) => (
                <li key={`${item.kind}-${item.label}-${i}`}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                      i === selectedIndex
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="text-xs text-gray-400 w-12 flex-shrink-0">
                      {item.kind === "history"
                        ? "履歴"
                        : item.kind === "caption"
                          ? "見出し"
                          : item.kind === "project"
                            ? "物件"
                            : item.kind === "articleJump"
                              ? "ジャンプ"
                              : "条文"}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query && !loading && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              該当する候補がありません
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2 flex gap-4 text-xs text-gray-400">
            <span>↑↓ 移動</span>
            <span>Enter 選択</span>
            <span>Esc 閉じる</span>
          </div>
        </div>
      </div>
    </div>
  );
}
