"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg mx-auto">
      <div className="flex items-center border border-gray-300 rounded-lg bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <svg
          className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0"
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
          placeholder="条文番号・キーワードで検索（例: 防火区画, 第112条）"
          className="flex-1 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
        />
        <button
          type="submit"
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-r-lg hover:bg-blue-700 transition-colors"
        >
          検索
        </button>
      </div>
    </form>
  );
}
