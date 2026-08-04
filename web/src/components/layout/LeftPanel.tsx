"use client";

import { memo, useEffect, useState } from "react";
import SearchPracticePanel from "@/components/search/SearchPracticePanel";
import TocPanel from "@/components/toc/TocPanel";
import type { TocNode } from "@/lib/article/toc-tree";

type MainView = "toc" | "search";
type DocumentStatus = "loading" | "ready" | "error";

interface LeftPanelProps {
  toc: TocNode[];
  documentStatus: DocumentStatus;
  currentArticleId: string | null;
}

const VIEW_STORAGE_KEY = "reader-left-panel-view";

// TocPanel ラッパーを memo 化し、タブUI部分の再描画を回避する。
// currentArticleId 変化時に TocPanel のみ再描画され、ボタン等はスキップされる。
const TocPanelSection = memo(function TocPanelSection({
  toc,
  currentArticleId,
  loading,
}: {
  toc: TocNode[];
  currentArticleId: string | null;
  loading: boolean;
}) {
  return <TocPanel nodes={toc} currentArticleId={currentArticleId} loading={loading} />;
});

export default function LeftPanel({
  toc,
  documentStatus,
  currentArticleId,
}: LeftPanelProps) {
  const [view, setViewState] = useState<MainView>(() => {
    if (typeof window === "undefined") return "toc";
    try {
      const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "toc" || stored === "search") return stored;
    } catch {
      // 保存値が使えない場合は目次を開く。
    }
    return "toc";
  });

  function setView(next: MainView) {
    setViewState(next);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // private modeでもタブ切替自体は維持する。
    }
  }

  useEffect(() => {
    function onSearchExecuted() {
      setViewState("search");
    }
    window.addEventListener("search-executed", onSearchExecuted);
    return () => window.removeEventListener("search-executed", onSearchExecuted);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-neutral-300">
        <button
          type="button"
          onClick={() => setView("toc")}
          className={`flex-1 py-2 text-xs font-medium ${
            view === "toc"
              ? "border-b-2 border-[#d92f7e] text-[#9d1f58]"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          目次
        </button>
        <button
          type="button"
          onClick={() => setView("search")}
          className={`flex-1 py-2 text-xs font-medium ${
            view === "search"
              ? "border-b-2 border-[#d92f7e] text-[#9d1f58]"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          検索
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {view === "toc" && documentStatus === "error" && (
          <p className="px-3 py-6 text-center text-xs text-neutral-500">
            目次を読み込めません
          </p>
        )}
        {view === "toc" && documentStatus !== "error" && (
          <TocPanelSection
            toc={toc}
            currentArticleId={currentArticleId}
            loading={documentStatus === "loading"}
          />
        )}
        {view === "search" && <SearchPracticePanel />}
      </div>
    </div>
  );
}
