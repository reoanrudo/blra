"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  buildArticleHref,
  todayInJapan,
} from "@/lib/applicability/applicability-context";

interface SearchResult {
  id: string;
  articleNumberNormalized: string | null;
  caption: string | null;
  textSnippet: string;
  lawName: string;
  lawShortName: string | null;
  matchSource: "caption" | "text";
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";
  const today = todayInJapan();
  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setSearched(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => setResults(data.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [q]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Search header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <form onSubmit={onSubmit} className="flex items-center gap-2 max-w-2xl">
          <div className="flex-1 flex items-center border border-gray-300 rounded px-3 py-1.5 bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
            <svg
              className="w-4 h-4 text-gray-400 flex-shrink-0"
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
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-2 text-sm text-gray-900 outline-none bg-transparent"
              placeholder="キーワードで条文を検索"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            検索
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">
              該当する条文が見つかりませんでした
            </p>
            <p className="text-xs text-gray-400 mt-1">
              別のキーワードをお試しください
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
              {results.length} 件の結果
            </p>
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={buildArticleHref(r.id, {
                      anchor: "TODAY",
                      asOf: today,
                      projectId: null,
                    })}
                    className="block px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400">
                        {r.lawShortName ?? r.lawName}
                      </span>
                      {r.articleNumberNormalized && (
                        <span className="text-xs font-semibold text-blue-600">
                          第{r.articleNumberNormalized}条
                        </span>
                      )}
                      {r.matchSource === "caption" && (
                        <span className="text-xs bg-green-100 text-green-700 px-1 rounded">
                          見出し一致
                        </span>
                      )}
                    </div>
                    {r.caption && (
                      <p className="text-sm font-bold italic text-gray-700 mb-0.5">
                        {r.caption}
                      </p>
                    )}
                    {r.textSnippet && (
                      <p
                        className="text-xs text-gray-600 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: r.textSnippet }}
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && !searched && (
          <div className="py-12 text-center text-sm text-gray-400">
            キーワードを入力して検索してください
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
