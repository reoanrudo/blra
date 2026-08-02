"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchPanel, { type SearchResult } from "./SearchPanel";
import { readerArticleHref } from "@/lib/article/full-law-document";

export default function SearchPracticePanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const previousQueryRef = useRef("");

  useEffect(() => {
    if (searchQuery && !previousQueryRef.current) {
      window.dispatchEvent(new CustomEvent("search-executed"));
    }
    previousQueryRef.current = searchQuery;
    setSelectedResultIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    function onSearchNavigation(event: Event) {
      const { direction } = (event as CustomEvent).detail as {
        direction: "next" | "prev";
      };
      setSelectedResultIndex((current) => {
        if (searchResults.length === 0) return -1;
        if (direction === "next") {
          return current < searchResults.length - 1 ? current + 1 : 0;
        }
        return current > 0 ? current - 1 : searchResults.length - 1;
      });
    }

    function onSearchSelect() {
      setSelectedResultIndex((current) => {
        const result = searchResults[current];
        if (result) {
          window.open(
            readerArticleHref(result.id),
            "_blank",
            "noopener,noreferrer",
          );
        }
        return current;
      });
    }

    window.addEventListener("search-result-nav", onSearchNavigation);
    window.addEventListener("search-result-select", onSearchSelect);
    return () => {
      window.removeEventListener("search-result-nav", onSearchNavigation);
      window.removeEventListener("search-result-select", onSearchSelect);
    };
  }, [searchResults]);

  const handleSearchStateChange = useCallback(
    (state: {
      query: string;
      results: SearchResult[];
      loading: boolean;
    }) => {
      setSearchQuery(state.query);
      setSearchResults(state.results);
      setSearchLoading(state.loading);
    },
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-200 p-3">
        <SearchPanel onSearchStateChange={handleSearchStateChange} />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {!searchQuery && (
          <section className="px-2 py-5" aria-labelledby="topic-index-title">
            <h2
              id="topic-index-title"
              className="text-sm font-semibold text-neutral-800"
            >
              論点索引
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              確認済み論点の整備後に公開します
            </p>
          </section>
        )}

        {searchQuery && searchLoading && (
          <div className="flex justify-center py-6" aria-label="検索中">
            <div className="h-4 w-4 animate-spin rounded-full border border-[#d92f7e] border-t-transparent" />
          </div>
        )}

        {searchQuery && !searchLoading && searchResults.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-xs text-neutral-500">
              該当する条文が見つかりませんでした
            </p>
            <p className="mt-1 text-[10px] text-neutral-400">
              別のキーワードをお試しください
            </p>
          </div>
        )}

        {searchQuery && !searchLoading && searchResults.length > 0 && (
          <div>
            <p className="px-2 py-1 text-xs text-neutral-500">
              {searchResults.length} 件の結果
            </p>
            <ul className="space-y-0.5">
              {searchResults.map((result, index) => (
                <li key={result.id}>
                  <a
                    href={readerArticleHref(result.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block w-full rounded-sm px-2 py-1.5 text-left ${
                      index === selectedResultIndex
                        ? "bg-[#fff4f9] ring-1 ring-[#d92f7e]"
                        : "hover:bg-white"
                    }`}
                  >
                    <span className="mb-0.5 flex items-center gap-2">
                      <span className="text-[10px] text-neutral-500">
                        {result.lawShortName ?? result.lawName}
                      </span>
                      {result.articleNumberNormalized && (
                        <strong className="text-[10px] text-[#9d1f58]">
                          第{result.articleNumberNormalized}条
                        </strong>
                      )}
                    </span>
                    {result.caption && (
                      <span className="block truncate text-xs font-bold text-neutral-700">
                        {result.caption}
                      </span>
                    )}
                    {result.textSnippet && (
                      <span
                        className="mt-0.5 block text-[10px] leading-relaxed text-neutral-600"
                        dangerouslySetInnerHTML={{
                          __html: result.textSnippet,
                        }}
                      />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
